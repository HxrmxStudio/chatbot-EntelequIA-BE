import { Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { coerceTimestamp } from '@/common/utils/date.utils';
import { toJsonb } from './shared';
import type {
  AuthenticatedUserProfileInput,
  ChatPersistencePort,
  PersistTurnInput,
} from '../../application/ports/chat-persistence.port';
import type { ChannelSource } from '../../domain/source';
import type { MessageHistoryItem } from '../../domain/context-block';
import {
  WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
  mapConversationHistoryRowsToMessageHistoryItems,
  type ConversationHistoryRow,
} from '../../domain/conversation-history';
import type { UserContext } from '../../domain/user';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgChatRepository implements ChatPersistencePort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async upsertUser(userId: string): Promise<UserContext> {
    const result = await this.pool.query<UserUpsertRow>(
      `INSERT INTO users (id, email, phone, name, created_at, updated_at)
       VALUES ($1, $1, '', 'Customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           name = EXCLUDED.name,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, phone, name, created_at, updated_at`,
      [userId],
    );

    return mapUserUpsertRow(result.rows[0]);
  }

  async upsertAuthenticatedUserProfile(input: AuthenticatedUserProfileInput): Promise<UserContext> {
    const result = await this.pool.query<UserUpsertRow>(
      `INSERT INTO users (id, email, phone, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           name = EXCLUDED.name,
           updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, phone, name, created_at, updated_at`,
      [input.id, input.email, input.phone, input.name],
    );

    return mapUserUpsertRow(result.rows[0]);
  }

  async upsertConversation(input: {
    conversationId: string;
    userId: string;
    channel: ChannelSource;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO conversations (id, user_id, channel)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id,
                     channel = EXCLUDED.channel,
                     updated_at = CURRENT_TIMESTAMP`,
      [input.conversationId, input.userId, input.channel],
    );
  }

  async getConversationHistory(input: {
    conversationId: string;
    limit: number;
  }): Promise<MessageHistoryItem[]> {
    const rows = await this.getConversationHistoryRows(input);
    return mapConversationHistoryRowsToMessageHistoryItems(rows);
  }

  async getConversationHistoryRows(input: {
    conversationId: string;
    limit: number;
  }): Promise<ConversationHistoryRow[]> {
    const limit = Math.min(
      Math.max(0, input.limit),
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
    );

    const result = await this.pool.query<{
      id: string;
      content: string;
      sender: string;
      type: string;
      channel: string | null;
      metadata: unknown;
      created_at: Date;
    }>(
      `SELECT id, content, sender, type, channel, metadata, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [input.conversationId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content ?? null,
      sender: row.sender ?? null,
      type: row.type ?? null,
      channel: row.channel ?? null,
      metadata: row.metadata ?? null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
    }));
  }

  async getLastBotMessageByExternalEvent(input: {
    channel: ChannelSource;
    externalEventId: string;
    conversationId?: string;
  }): Promise<string | null> {
    const result = await this.pool.query<{ content: string }>(
      `SELECT content
       FROM messages
       WHERE channel = $1
         AND external_event_id = $2
         AND ($3::varchar IS NULL OR conversation_id = $3)
         AND sender = 'bot'
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.channel, input.externalEventId, input.conversationId ?? null],
    );

    return result.rows[0]?.content ?? null;
  }

  async persistTurn(input: PersistTurnInput): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await this.upsertUserWithClient(client, input.userId);
      await this.upsertConversationWithClient(client, {
        conversationId: input.conversationId,
        userId: input.userId,
        channel: input.source,
      });

      await client.query(
        `INSERT INTO messages (conversation_id, user_id, content, sender, type, channel, external_event_id, metadata)
         VALUES ($1, $2, $3, 'user', 'text', $4, $5, $6::jsonb)`,
        [
          input.conversationId,
          input.userId,
          input.userMessage,
          input.source,
          input.externalEventId,
          toJsonb({ intent: input.intent, ...(input.metadata ?? {}) }),
        ],
      );

      const botMessageInsert = await client.query<{ id: string }>(
        `INSERT INTO messages (conversation_id, user_id, content, sender, type, channel, external_event_id, metadata)
         VALUES ($1, $2, $3, 'bot', 'text', $4, $5, $6::jsonb)
         RETURNING id`,
        [
          input.conversationId,
          input.userId,
          input.botMessage,
          input.source,
          input.externalEventId,
          toJsonb({ intent: input.intent, ...(input.metadata ?? {}) }),
        ],
      );

      if (input.source === 'whatsapp') {
        const botMessageId = botMessageInsert.rows[0]?.id ?? null;
        const outboxConversationId = asNullableUuid(input.conversationId);

        await client.query(
          `INSERT INTO outbox_messages (channel, to_ref, conversation_id, message_id, payload, status)
           VALUES ('whatsapp', $1, $2::uuid, $3::uuid, $4::jsonb, 'pending')
           ON CONFLICT (message_id, channel, to_ref)
             WHERE message_id IS NOT NULL
           DO NOTHING`,
          [
            input.userId,
            outboxConversationId,
            botMessageId,
            toJsonb({
              conversationId: input.conversationId,
              message: input.botMessage,
              externalEventId: input.externalEventId,
              source: input.source,
            }),
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertUserWithClient(client: PoolClient, userId: string): Promise<void> {
    await client.query(
      `INSERT INTO users (id, email, phone, name, created_at, updated_at)
       VALUES ($1, $1, '', 'Customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE
       SET email = CASE
             WHEN users.email IS NULL OR users.email = '' OR users.email = users.id
               THEN EXCLUDED.email
             ELSE users.email
           END,
           phone = CASE
             WHEN users.phone IS NULL OR users.phone = ''
               THEN EXCLUDED.phone
             ELSE users.phone
           END,
           name = CASE
             WHEN users.name IS NULL OR users.name = '' OR users.name = 'Customer'
               THEN EXCLUDED.name
             ELSE users.name
           END,
           updated_at = CURRENT_TIMESTAMP`,
      [userId],
    );
  }

  private async upsertConversationWithClient(
    client: PoolClient,
    input: { conversationId: string; userId: string; channel: ChannelSource },
  ): Promise<void> {
    await client.query(
      `INSERT INTO conversations (id, user_id, channel)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET user_id = EXCLUDED.user_id,
                     channel = EXCLUDED.channel,
                     updated_at = CURRENT_TIMESTAMP`,
      [input.conversationId, input.userId, input.channel],
    );
  }
}

function asNullableUuid(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return UUID_V4_PATTERN.test(normalized) ? normalized : null;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UserUpsertRow = {
  id: string;
  email: string;
  phone: string;
  name: string;
  created_at: unknown;
  updated_at: unknown;
};

function mapUserUpsertRow(row: UserUpsertRow): UserContext {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? '',
    name: row.name ?? 'Customer',
    createdAt: coerceTimestamp(row.created_at),
    updatedAt: coerceTimestamp(row.updated_at),
  };
}
