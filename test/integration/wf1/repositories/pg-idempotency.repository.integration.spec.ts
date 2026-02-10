import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PgIdempotencyRepository } from '@/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import { PG_POOL } from '@/modules/wf1/application/ports/tokens';

const REQUIRED_TABLES = ['users', 'conversations', 'messages', 'external_events'];

jest.setTimeout(30_000);

const hasDbUrl = Boolean(
  (process.env.CHATBOT_DB_TEST_URL ?? process.env.CHATBOT_DB_URL)?.trim(),
);

describe('PgIdempotencyRepository (PostgreSQL integration)', () => {
  let repository: PgIdempotencyRepository | undefined;
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
          `Set CHATBOT_DB_TEST_URL (or CHATBOT_DB_URL) to a reachable test DB. Details: ${details}`,
      );
    }

    await assertRequiredTables(pool);

    const moduleRef = await import('@nestjs/testing').then((m) =>
      m.Test.createTestingModule({
        providers: [
          {
            provide: PG_POOL,
            useFactory: () => pool,
          },
          PgIdempotencyRepository,
        ],
      }).compile(),
    );

    repository = moduleRef.get(PgIdempotencyRepository);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  (hasDbUrl ? it : it.skip)('detects duplicate processing by external_events(source, external_event_id)', async () => {
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
