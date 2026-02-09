import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient } from 'pg';
import type {
  ChatPersistencePort,
  PersistTurnInput,
} from '../../application/ports/chat-persistence.port';
import type {
  IdempotencyPort,
  IdempotencyStartResult,
} from '../../application/ports/idempotency.port';
import type { AuditEntryInput, AuditPort } from '../../application/ports/audit.port';
import type { ChannelSource } from '../../domain/source';
import type { MessageHistoryItem } from '../../domain/context-block';

@Injectable()
export class PgWf1Repository
  implements ChatPersistencePort, IdempotencyPort, AuditPort, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PgWf1Repository.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = new Pool({
      connectionString: this.configService.get<string>('CHATBOT_DB_URL'),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureAuditTable();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async upsertUser(userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id)
       VALUES ($1)
       ON CONFLICT (id)
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [userId],
    );
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
      .map((row: { sender: 'user' | 'bot' | 'agent' | 'system'; content: string; created_at: Date }) => ({
        sender: row.sender,
        content: row.content,
        createdAt: row.created_at.toISOString(),
      }));
  }

  async getLastBotMessageByExternalEvent(input: {
    channel: ChannelSource;
    externalEventId: string;
    conversationId: string;
  }): Promise<string | null> {
    const result = await this.pool.query<{ content: string }>(
      `SELECT content
       FROM messages
       WHERE channel = $1
         AND external_event_id = $2
         AND conversation_id = $3
         AND sender = 'bot'
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.channel, input.externalEventId, input.conversationId],
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

  async startProcessing(input: {
    source: ChannelSource;
    externalEventId: string;
    payload: Record<string, unknown>;
    requestId: string;
  }): Promise<IdempotencyStartResult> {
    const result = await this.pool.query(
      `INSERT INTO external_events (source, external_event_id, payload, status, error)
       VALUES ($1, $2, $3::jsonb, 'processing', NULL)
       ON CONFLICT (source, external_event_id)
       DO NOTHING`,
      [input.source, input.externalEventId, JSON.stringify({ ...input.payload, requestId: input.requestId })],
    );

    return {
      isDuplicate: result.rowCount === 0,
    };
  }

  async markProcessed(input: { source: ChannelSource; externalEventId: string }): Promise<void> {
    await this.pool.query(
      `UPDATE external_events
       SET status = 'processed', processed_at = now(), error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE source = $1 AND external_event_id = $2`,
      [input.source, input.externalEventId],
    );
  }

  async markFailed(input: {
    source: ChannelSource;
    externalEventId: string;
    errorMessage: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE external_events
       SET status = 'failed', error = $3, updated_at = CURRENT_TIMESTAMP
       WHERE source = $1 AND external_event_id = $2`,
      [input.source, input.externalEventId, input.errorMessage.slice(0, 1000)],
    );
  }

  async writeAudit(input: AuditEntryInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (
         request_id,
         user_id,
         conversation_id,
         source,
         intent,
         status,
         message,
         http_status,
         error_code,
         latency_ms,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        input.requestId,
        input.userId,
        input.conversationId,
        input.source,
        input.intent,
        input.status,
        input.message,
        input.httpStatus,
        input.errorCode ?? null,
        input.latencyMs,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  private async ensureAuditTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        request_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        conversation_id VARCHAR(255) NOT NULL,
        source message_channel NOT NULL,
        intent VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        http_status INT NOT NULL,
        error_code VARCHAR(100),
        latency_ms INT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
    `);

    this.logger.log('Audit table check complete');
  }

  private async upsertUserWithClient(client: PoolClient, userId: string): Promise<void> {
    await client.query(
      `INSERT INTO users (id)
       VALUES ($1)
       ON CONFLICT (id)
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
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
