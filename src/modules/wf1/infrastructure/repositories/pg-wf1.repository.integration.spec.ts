import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PgWf1Repository } from './pg-wf1.repository';

const REQUIRED_TABLES = ['users', 'conversations', 'messages', 'external_events'];

jest.setTimeout(30_000);

describe('PgWf1Repository (PostgreSQL integration)', () => {
  let repository: PgWf1Repository | undefined;
  let pool: Pool | undefined;

  beforeAll(async () => {
    const databaseUrl = resolveDatabaseUrl();
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
    });

    try {
      await pool.query('SELECT 1');
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(
        `PostgreSQL integration test cannot connect to database. ` +
          `Set CHATBOT_DB_TEST_URL (or CHATBOT_DB_URL) to a reachable test DB. Details: ${details}`,
      );
    }

    await assertRequiredTables(pool);
    await assertDedupeMigrationApplied(pool);

    const configService: Pick<ConfigService, 'get'> = {
      get: (key: string): string | undefined => (key === 'CHATBOT_DB_URL' ? databaseUrl : undefined),
    };

    repository = new PgWf1Repository(configService as ConfigService);
    await repository.onModuleInit();
  });

  afterAll(async () => {
    if (repository) {
      await repository.onModuleDestroy();
    }

    if (pool) {
      await pool.end();
    }
  });

  it('persists user+bot messages with same external_event_id without unique violations', async () => {
    if (!repository || !pool) {
      throw new Error('Repository test setup failed');
    }

    const runId = randomUUID();
    const userId = `it-user-${runId}`;
    const conversationId = `it-conversation-${runId}`;
    const externalEventId = `it-event-${runId}`;

    try {
      await repository.persistTurn({
        conversationId,
        userId,
        source: 'web',
        externalEventId,
        userMessage: 'hola',
        botMessage: 'hola, en que te ayudo?',
        intent: 'general',
        metadata: { test: 'pg-integration' },
      });

      const result = await pool.query<{ sender: 'user' | 'bot'; content: string }>(
        `SELECT sender, content
         FROM messages
         WHERE conversation_id = $1
           AND external_event_id = $2
         ORDER BY sender ASC`,
        [conversationId, externalEventId],
      );

      expect(result.rowCount).toBe(2);
      expect(result.rows.map((row) => row.sender).sort()).toEqual(['bot', 'user']);

      const lastBotMessage = await repository.getLastBotMessageByExternalEvent({
        channel: 'web',
        externalEventId,
        conversationId,
      });
      expect(lastBotMessage).toBe('hola, en que te ayudo?');
    } finally {
      await cleanupConversationData(pool, { conversationId, userId });
    }
  });

  it('detects duplicate processing by external_events(source, external_event_id)', async () => {
    if (!repository || !pool) {
      throw new Error('Repository test setup failed');
    }

    const externalEventId = `it-external-event-${randomUUID()}`;

    try {
      const first = await repository.startProcessing({
        source: 'web',
        externalEventId,
        payload: { test: true },
        requestId: `req-${randomUUID()}`,
      });

      const second = await repository.startProcessing({
        source: 'web',
        externalEventId,
        payload: { test: true },
        requestId: `req-${randomUUID()}`,
      });

      expect(first.isDuplicate).toBe(false);
      expect(second.isDuplicate).toBe(true);
    } finally {
      await pool.query('DELETE FROM external_events WHERE source = $1 AND external_event_id = $2', [
        'web',
        externalEventId,
      ]);
    }
  });
});

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.CHATBOT_DB_TEST_URL ?? process.env.CHATBOT_DB_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error(
      'PostgreSQL integration test requires CHATBOT_DB_TEST_URL (or CHATBOT_DB_URL) environment variable.',
    );
  }

  return databaseUrl.trim();
}

async function assertRequiredTables(pool: Pool): Promise<void> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES],
  );

  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !found.has(table));

  if (missing.length > 0) {
    throw new Error(
      `Missing required tables for integration test: ${missing.join(', ')}. ` +
        `Apply sql/01_initial_schema.sql before running this test.`,
    );
  }
}

async function assertDedupeMigrationApplied(pool: Pool): Promise<void> {
  const legacyIndex = await pool.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uniq_messages_channel_external'`,
  );

  if ((legacyIndex.rowCount ?? 0) > 0) {
    throw new Error(
      'Legacy index uniq_messages_channel_external still exists. Apply sql/03_fix_messages_event_dedupe.sql.',
    );
  }

  const newIndex = await pool.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uniq_messages_channel_external_sender'`,
  );

  if ((newIndex.rowCount ?? 0) === 0) {
    throw new Error(
      'Missing index uniq_messages_channel_external_sender. Apply sql/03_fix_messages_event_dedupe.sql.',
    );
  }
}

async function cleanupConversationData(
  pool: Pool,
  input: { conversationId: string; userId: string },
): Promise<void> {
  await pool.query('DELETE FROM messages WHERE conversation_id = $1', [input.conversationId]);
  await pool.query('DELETE FROM conversations WHERE id = $1', [input.conversationId]);
  await pool.query('DELETE FROM users WHERE id = $1', [input.userId]);
}
