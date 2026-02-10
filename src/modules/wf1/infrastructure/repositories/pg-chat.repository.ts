import { Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type {
  ChatPersistencePort,
  PersistTurnInput,
} from '../../application/ports/chat-persistence.port';
import type { ChannelSource } from '../../domain/source';
import type { MessageHistoryItem } from '../../domain/context-block';
import type { UserContext } from '../../domain/user';
import { PG_POOL } from '../../application/ports/tokens';

@Injectable()
export class PgChatRepository implements ChatPersistencePort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async upsertUser(userId: string): Promise<UserContext> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      phone: string;
      name: string;
      created_at: unknown;
      updated_at: unknown;
    }>(
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

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      phone: row.phone ?? '',
      name: row.name ?? 'Customer',
      createdAt: coerceTimestamp(row.created_at),
      updatedAt: coerceTimestamp(row.updated_at),
    };
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
    const result = await this.pool.query<{
      sender: 'user' | 'bot' | 'agent' | 'system';
      content: string;
      created_at: Date;
    }>(
      `SELECT sender, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [input.conversationId, input.limit],
    );

    return result.rows
      .reverse()
      .map((row) => ({
        sender: row.sender,
        content: row.content,
        createdAt: row.created_at.toISOString(),
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
          JSON.stringify({ intent: input.intent, ...(input.metadata ?? {}) }),
        ],
      );

      await client.query(
        `INSERT INTO messages (conversation_id, user_id, content, sender, type, channel, external_event_id, metadata)
         VALUES ($1, $2, $3, 'bot', 'text', $4, $5, $6::jsonb)`,
        [
          input.conversationId,
          input.userId,
          input.botMessage,
          input.source,
          input.externalEventId,
          JSON.stringify({ intent: input.intent, ...(input.metadata ?? {}) }),
        ],
      );

      if (input.source === 'whatsapp') {
        await client.query(
          `INSERT INTO outbox_messages (channel, to_ref, payload, status)
           VALUES ('whatsapp', $1, $2::jsonb, 'pending')`,
          [
            input.userId,
            JSON.stringify({
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
       SET email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           name = EXCLUDED.name,
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

function coerceTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}
