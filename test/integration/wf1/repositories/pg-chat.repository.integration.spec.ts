import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PgChatRepository } from '@/modules/wf1/infrastructure/repositories/pg-chat.repository';
import { PG_POOL } from '@/modules/wf1/application/ports/tokens';

const REQUIRED_TABLES = ['users', 'conversations', 'messages', 'external_events', 'outbox_messages'];

jest.setTimeout(30_000);

const hasDbUrl = Boolean(process.env.CHATBOT_DB_URL?.trim());

describe('PgChatRepository (PostgreSQL integration)', () => {
  let repository: PgChatRepository | undefined;
  let pool: Pool | undefined;

  beforeAll(async () => {
    if (!hasDbUrl) return;

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
          `Set CHATBOT_DB_URL to a reachable DB. Details: ${details}`,
      );
    }

    await assertRequiredTables(pool);
    await assertDedupeMigrationApplied(pool);

    const moduleRef = await import('@nestjs/testing').then((m) =>
      m.Test.createTestingModule({
        providers: [
          {
            provide: PG_POOL,
            useFactory: () => pool,
          },
          PgChatRepository,
        ],
      }).compile(),
    );

    repository = moduleRef.get(PgChatRepository);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  (hasDbUrl ? it : it.skip)('persists user+bot messages with same external_event_id without unique violations', async () => {
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

      const outboxForWeb = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM outbox_messages
         WHERE to_ref = $1
           AND channel = 'whatsapp'`,
        [userId],
      );
      expect(outboxForWeb.rows[0]?.total).toBe(0);

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

  (hasDbUrl ? it : it.skip)('stores whatsapp outbox with message_id and conversation_id when source=whatsapp', async () => {
    if (!repository || !pool) {
      throw new Error('Repository test setup failed');
    }

    const runId = randomUUID();
    const userId = `it-user-${runId}`;
    const conversationId = randomUUID();
    const externalEventId = `it-event-whatsapp-${runId}`;

    try {
      await repository.persistTurn({
        conversationId,
        userId,
        source: 'whatsapp',
        externalEventId,
        userMessage: 'hola',
        botMessage: 'hola desde whatsapp',
        intent: 'general',
        metadata: { test: 'pg-integration-whatsapp' },
      });

      const outbox = await pool.query<{
        channel: string;
        to_ref: string;
        conversation_id: string | null;
        message_id: string | null;
        external_event_id: string | null;
      }>(
        `SELECT
           channel::text,
           to_ref,
           conversation_id::text AS conversation_id,
           message_id::text AS message_id,
           payload->>'externalEventId' AS external_event_id
         FROM outbox_messages
         WHERE channel = 'whatsapp'
           AND to_ref = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId],
      );

      expect(outbox.rowCount).toBe(1);
      expect(outbox.rows[0]?.channel).toBe('whatsapp');
      expect(outbox.rows[0]?.to_ref).toBe(userId);
      expect(outbox.rows[0]?.conversation_id).toBe(conversationId);
      expect(outbox.rows[0]?.external_event_id).toBe(externalEventId);
      expect(outbox.rows[0]?.message_id).toEqual(expect.any(String));

      const botMessage = await pool.query<{ id: string }>(
        `SELECT id::text AS id
         FROM messages
         WHERE conversation_id = $1
           AND external_event_id = $2
           AND sender = 'bot'
         ORDER BY created_at DESC
         LIMIT 1`,
        [conversationId, externalEventId],
      );

      expect(botMessage.rowCount).toBe(1);
      expect(outbox.rows[0]?.message_id).toBe(botMessage.rows[0]?.id);
    } finally {
      await cleanupConversationData(pool, { conversationId, userId });
    }
  });

  (hasDbUrl ? it : it.skip)('upserts authenticated profile by email when email already exists with different id', async () => {
    if (!repository || !pool) {
      throw new Error('Repository test setup failed');
    }

    const runId = randomUUID();
    const existingUserId = `it-user-existing-${runId}`;
    const incomingUserId = `it-user-auth-${runId}`;
    const sharedEmail = `it-email-${runId}@example.com`;

    try {
      await pool.query(
        `INSERT INTO users (id, email, phone, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [existingUserId, sharedEmail, '', 'Customer'],
      );

      const upserted = await repository.upsertAuthenticatedUserProfile({
        id: incomingUserId,
        email: sharedEmail,
        phone: '1122334455',
        name: 'Test User',
      });

      expect(upserted.id).toBe(existingUserId);
      expect(upserted.email).toBe(sharedEmail);
      expect(upserted.phone).toBe('1122334455');
      expect(upserted.name).toBe('Test User');

      const usersWithEmail = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE email = $1`,
        [sharedEmail],
      );
      expect(usersWithEmail.rows[0]?.total).toBe(1);

      const incomingUser = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM users
         WHERE id = $1`,
        [incomingUserId],
      );
      expect(incomingUser.rows[0]?.total).toBe(0);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [incomingUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [existingUserId]);
      await pool.query('DELETE FROM users WHERE email = $1', [sharedEmail]);
    }
  });

  (hasDbUrl ? it : it.skip)('reactivates a closed conversation when a new turn arrives', async () => {
    if (!repository || !pool) {
      throw new Error('Repository test setup failed');
    }

    const runId = randomUUID();
    const userId = `it-user-closed-${runId}`;
    const conversationId = `it-conversation-closed-${runId}`;

    try {
      await repository.upsertUser(userId);

      await pool.query(
        `INSERT INTO conversations (id, user_id, channel, status, created_at, updated_at)
         VALUES ($1, $2, 'web', 'closed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP - interval '2 days')`,
        [conversationId, userId],
      );

      await repository.upsertConversation({
        conversationId,
        userId,
        channel: 'web',
      });

      const result = await pool.query<{ status: string }>(
        `SELECT status
         FROM conversations
         WHERE id = $1`,
        [conversationId],
      );

      expect(result.rows[0]?.status).toBe('active');
    } finally {
      await cleanupConversationData(pool, { conversationId, userId });
    }
  });
});

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.CHATBOT_DB_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error('PostgreSQL integration test requires CHATBOT_DB_URL environment variable.');
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
  await pool.query('DELETE FROM outbox_messages WHERE to_ref = $1', [input.userId]);
  await pool.query('DELETE FROM messages WHERE conversation_id = $1', [input.conversationId]);
  await pool.query('DELETE FROM conversations WHERE id = $1', [input.conversationId]);
  await pool.query('DELETE FROM users WHERE id = $1', [input.userId]);
}
