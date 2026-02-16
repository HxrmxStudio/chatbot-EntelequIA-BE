import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import { PG_POOL } from '@/modules/wf1/application/ports/tokens';
import { PgChatRepository } from '@/modules/wf1/infrastructure/repositories/pg-chat.repository';

jest.setTimeout(30_000);

const hasDbUrl = Boolean(process.env.CHATBOT_DB_URL?.trim());

describe('Outbox idempotency guarantees (PostgreSQL integration)', () => {
  let repository: PgChatRepository | undefined;
  let pool: Pool | undefined;

  beforeAll(async () => {
    if (!hasDbUrl) {
      return;
    }

    const databaseUrl = resolveDatabaseUrl();
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
    });

    await pool.query('SELECT 1');

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: PG_POOL,
          useFactory: () => pool,
        },
        PgChatRepository,
      ],
    }).compile();

    repository = moduleRef.get(PgChatRepository);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  (hasDbUrl ? it : it.skip)(
    'keeps a single outbox row when same externalEventId is processed twice',
    async () => {
      if (!repository || !pool) {
        throw new Error('Repository test setup failed');
      }

      const runId = randomUUID();
      const userId = `it-user-${runId}`;
      const conversationId = randomUUID();
      const externalEventId = `it-outbox-event-${runId}`;

      try {
        await repository.persistTurn({
          conversationId,
          userId,
          source: 'whatsapp',
          externalEventId,
          userMessage: 'hola',
          botMessage: 'respuesta 1',
          intent: 'general',
          metadata: { test: 'outbox-idempotency' },
        });

        await expect(
          repository.persistTurn({
            conversationId,
            userId,
            source: 'whatsapp',
            externalEventId,
            userMessage: 'hola repetido',
            botMessage: 'respuesta repetida',
            intent: 'general',
            metadata: { test: 'outbox-idempotency-duplicate' },
          }),
        ).rejects.toThrow();

        const outboxCount = await pool.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total
           FROM outbox_messages
           WHERE channel = 'whatsapp'
             AND to_ref = $1
             AND payload->>'externalEventId' = $2`,
          [userId, externalEventId],
        );

        expect(outboxCount.rows[0]?.total).toBe(1);
      } finally {
        await cleanupConversationData(pool, { conversationId, userId });
      }
    },
  );

  (hasDbUrl ? it : it.skip)(
    'creates a new outbox row for a new externalEventId',
    async () => {
      if (!repository || !pool) {
        throw new Error('Repository test setup failed');
      }

      const runId = randomUUID();
      const userId = `it-user-${runId}`;
      const conversationId = randomUUID();
      const externalEventIdA = `it-outbox-new-a-${runId}`;
      const externalEventIdB = `it-outbox-new-b-${runId}`;

      try {
        await repository.persistTurn({
          conversationId,
          userId,
          source: 'whatsapp',
          externalEventId: externalEventIdA,
          userMessage: 'hola a',
          botMessage: 'respuesta a',
          intent: 'general',
          metadata: { test: 'outbox-new-event-a' },
        });

        await repository.persistTurn({
          conversationId,
          userId,
          source: 'whatsapp',
          externalEventId: externalEventIdB,
          userMessage: 'hola b',
          botMessage: 'respuesta b',
          intent: 'general',
          metadata: { test: 'outbox-new-event-b' },
        });

        const outboxCount = await pool.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total
           FROM outbox_messages
           WHERE channel = 'whatsapp'
             AND to_ref = $1`,
          [userId],
        );

        expect(outboxCount.rows[0]?.total).toBe(2);
      } finally {
        await cleanupConversationData(pool, { conversationId, userId });
      }
    },
  );

  (hasDbUrl ? it : it.skip)(
    'does not duplicate outbox rows when same message key is re-inserted after sent status',
    async () => {
      if (!repository || !pool) {
        throw new Error('Repository test setup failed');
      }

      const runId = randomUUID();
      const userId = `it-user-${runId}`;
      const conversationId = randomUUID();
      const externalEventId = `it-outbox-sent-${runId}`;

      try {
        await repository.persistTurn({
          conversationId,
          userId,
          source: 'whatsapp',
          externalEventId,
          userMessage: 'hola',
          botMessage: 'respuesta',
          intent: 'general',
          metadata: { test: 'outbox-sent' },
        });

        const current = await pool.query<{
          message_id: string;
          payload: unknown;
          total: number;
        }>(
          `SELECT message_id::text AS message_id, payload, COUNT(*) OVER()::int AS total
           FROM outbox_messages
           WHERE channel = 'whatsapp'
             AND to_ref = $1
             AND payload->>'externalEventId' = $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId, externalEventId],
        );

        expect(current.rowCount).toBe(1);
        const messageId = current.rows[0]?.message_id;
        expect(messageId).toEqual(expect.any(String));

        await pool.query(
          `UPDATE outbox_messages
           SET status = 'sent', sent_at = CURRENT_TIMESTAMP
           WHERE channel = 'whatsapp'
             AND to_ref = $1
             AND payload->>'externalEventId' = $2`,
          [userId, externalEventId],
        );

        await pool.query(
          `INSERT INTO outbox_messages (channel, to_ref, conversation_id, message_id, payload, status)
           VALUES ('whatsapp', $1, $2::uuid, $3::uuid, $4::jsonb, 'pending')
           ON CONFLICT (message_id, channel, to_ref)
             WHERE message_id IS NOT NULL
           DO NOTHING`,
          [
            userId,
            conversationId,
            messageId,
            JSON.stringify({
              conversationId,
              externalEventId,
              source: 'whatsapp',
              message: 'reinserted',
            }),
          ],
        );

        const after = await pool.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total
           FROM outbox_messages
           WHERE channel = 'whatsapp'
             AND to_ref = $1
             AND payload->>'externalEventId' = $2`,
          [userId, externalEventId],
        );

        expect(after.rows[0]?.total).toBe(1);
      } finally {
        await cleanupConversationData(pool, { conversationId, userId });
      }
    },
  );
});

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.CHATBOT_DB_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error('PostgreSQL integration test requires CHATBOT_DB_URL environment variable.');
  }

  return databaseUrl.trim();
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

