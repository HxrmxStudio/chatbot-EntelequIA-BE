import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';

jest.setTimeout(120_000);

const dbUrl = process.env.CHATBOT_DB_TEST_URL?.trim();
const hasDbUrl = Boolean(dbUrl);

describe('bootstrap-learning-seeds script (PostgreSQL integration)', () => {
  let pool: Pool | undefined;
  let seedFilePath = '';
  let seedIds: string[] = [];

  beforeAll(async () => {
    if (!hasDbUrl) {
      return;
    }

    pool = new Pool({
      connectionString: dbUrl,
      max: 2,
    });

    await pool.query('SELECT 1');
    await assertBootstrapSchemaReady(pool);

    const runId = randomUUID().slice(0, 8);
    seedIds = [`qa-bootstrap-${runId}-1`, `qa-bootstrap-${runId}-2`];
    seedFilePath = join(tmpdir(), `wf1-learning-seeds-${runId}.jsonl`);
    await mkdir(join(tmpdir()), { recursive: true });
    await writeFile(seedFilePath, buildSeedFile(seedIds), 'utf8');
  });

  afterAll(async () => {
    if (pool && seedIds.length > 0 && seedFilePath.length > 0) {
      await cleanupSeedArtifacts(pool, seedIds, seedFilePath);
    }
    if (seedFilePath.length > 0) {
      await rm(seedFilePath, { force: true });
    }
    if (pool) {
      await pool.end();
    }
  });

  (hasDbUrl ? it : it.skip)(
    'runs twice without duplicating qa_seed exemplars and golden examples',
    async () => {
      if (!pool) {
        throw new Error('Expected PostgreSQL pool in integration test');
      }

      await cleanupSeedArtifacts(pool, seedIds, seedFilePath);

      runBootstrapSeedScript(seedFilePath, dbUrl ?? '');
      const firstCounts = await loadSeedCounts(pool, seedIds, seedFilePath);

      runBootstrapSeedScript(seedFilePath, dbUrl ?? '');
      const secondCounts = await loadSeedCounts(pool, seedIds, seedFilePath);

      expect(firstCounts.exemplarCount).toBe(seedIds.length);
      expect(firstCounts.goldenCount).toBe(seedIds.length);
      expect(firstCounts.exemplarFingerprintCount).toBe(seedIds.length);
      expect(firstCounts.goldenFingerprintCount).toBe(seedIds.length);
      expect(firstCounts.learningRuns).toBe(1);

      expect(secondCounts.exemplarCount).toBe(seedIds.length);
      expect(secondCounts.goldenCount).toBe(seedIds.length);
      expect(secondCounts.exemplarFingerprintCount).toBe(seedIds.length);
      expect(secondCounts.goldenFingerprintCount).toBe(seedIds.length);
      expect(secondCounts.learningRuns).toBe(2);
    },
  );
});

function runBootstrapSeedScript(seedFile: string, databaseUrl: string): void {
  execFileSync(
    'npx',
    [
      'ts-node',
      '--files',
      '-r',
      'tsconfig-paths/register',
      '--project',
      'tsconfig.json',
      'scripts/bootstrap-learning-seeds.ts',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CHATBOT_DB_URL: databaseUrl,
        WF1_LEARNING_SEED_FILE: seedFile,
        WF1_RECURSIVE_LEARNING_ENABLED: 'true',
      },
      stdio: 'pipe',
    },
  );
}

async function loadSeedCounts(
  pool: Pool,
  ids: string[],
  seedFilePath: string,
): Promise<{
  exemplarCount: number;
  goldenCount: number;
  exemplarFingerprintCount: number;
  goldenFingerprintCount: number;
  learningRuns: number;
}> {
  const exemplarResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM wf1_intent_exemplars
     WHERE source = 'qa_seed'
       AND evidence->>'seedId' = ANY($1::text[])`,
    [ids],
  );

  const goldenResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM hitl_golden_examples golden
     JOIN messages bot_message ON bot_message.id = golden.message_id
     WHERE golden.source = 'qa_seed'
       AND bot_message.external_event_id = ANY($1::text[])`,
    [ids.map((id) => `wf1-seed-${id}-bot-v1`)],
  );

  const runsResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM wf1_learning_runs
     WHERE run_type = 'bootstrap_seeds'
       AND summary->>'seedFile' = $1`,
    [seedFilePath],
  );

  const exemplarFingerprintResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM wf1_intent_exemplars
     WHERE source = 'qa_seed'
       AND evidence->>'seedId' = ANY($1::text[])
       AND evidence ? 'seedFingerprint'`,
    [ids],
  );

  const goldenFingerprintResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM hitl_golden_examples golden
     JOIN messages bot_message ON bot_message.id = golden.message_id
     WHERE golden.source = 'qa_seed'
       AND bot_message.external_event_id = ANY($1::text[])
       AND golden.notes ILIKE '%seed_fingerprint=%'`,
    [ids.map((id) => `wf1-seed-${id}-bot-v1`)],
  );

  return {
    exemplarCount: exemplarResult.rows[0]?.total ?? 0,
    goldenCount: goldenResult.rows[0]?.total ?? 0,
    exemplarFingerprintCount: exemplarFingerprintResult.rows[0]?.total ?? 0,
    goldenFingerprintCount: goldenFingerprintResult.rows[0]?.total ?? 0,
    learningRuns: runsResult.rows[0]?.total ?? 0,
  };
}

async function cleanupSeedArtifacts(
  pool: Pool,
  ids: string[],
  seedFilePath: string,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const eventIds = ids.flatMap((id) => [`wf1-seed-${id}-user-v1`, `wf1-seed-${id}-bot-v1`]);
  const conversationIds = ids.map((id) => `wf1-seed-conversation-${id}`);

  await pool.query(
    `DELETE FROM wf1_learning_runs
     WHERE run_type = 'bootstrap_seeds'
       AND summary->>'seedFile' = $1`,
    [seedFilePath],
  );

  await pool.query(
    `DELETE FROM wf1_intent_exemplars
     WHERE source = 'qa_seed'
       AND evidence->>'seedId' = ANY($1::text[])`,
    [ids],
  );

  await pool.query(
    `DELETE FROM hitl_golden_examples
     WHERE source = 'qa_seed'
       AND message_id IN (
         SELECT id
         FROM messages
         WHERE external_event_id = ANY($1::text[])
       )`,
    [eventIds.filter((eventId) => eventId.endsWith('-bot-v1'))],
  );

  await pool.query(
    `DELETE FROM messages
     WHERE external_event_id = ANY($1::text[])`,
    [eventIds],
  );

  await pool.query(
    `DELETE FROM conversations
     WHERE id = ANY($1::text[])`,
    [conversationIds],
  );
}

async function assertBootstrapSchemaReady(pool: Pool): Promise<void> {
  const missing: string[] = [];

  if (!(await tableExists(pool, 'wf1_intent_exemplars'))) {
    missing.push('table:wf1_intent_exemplars');
  }
  if (!(await tableExists(pool, 'hitl_golden_examples'))) {
    missing.push('table:hitl_golden_examples');
  }
  if (!(await tableExists(pool, 'wf1_learning_runs'))) {
    missing.push('table:wf1_learning_runs');
  }
  if (!(await columnExists(pool, 'hitl_golden_examples', 'source'))) {
    missing.push('column:hitl_golden_examples.source');
  }
  if (!(await constraintContains(pool, 'wf1_intent_exemplars', 'qa_seed'))) {
    missing.push('constraint:wf1_intent_exemplars.source includes qa_seed');
  }
  if (!(await constraintContains(pool, 'wf1_learning_runs', 'bootstrap_seeds'))) {
    missing.push('constraint:wf1_learning_runs.run_type includes bootstrap_seeds');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing schema prerequisites for bootstrap-learning-seeds integration test: ${missing.join(', ')}. ` +
        'Apply sql/12_learning_seed_support.sql before running this test.',
    );
  }
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return result.rows[0]?.exists === true;
}

async function columnExists(
  pool: Pool,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

async function constraintContains(
  pool: Pool,
  tableName: string,
  fragment: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = $1
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) ILIKE '%' || $2 || '%'
     ) AS exists`,
    [tableName, fragment],
  );
  return result.rows[0]?.exists === true;
}

function buildSeedFile(ids: string[]): string {
  const rows = [
    {
      id: ids[0],
      intent: 'orders',
      category: 'orders_accuracy',
      severity: 'P0',
      user_prompt: 'pedido 12345, dni 12345678, nombre Juan',
      expected_behavior: 'Responder estado del pedido si los datos coinciden.',
      failure_mode: 'validation_failed_with_correct_identity',
      non_technical_language_required: true,
      source: 'qa_seed',
      reviewed: true,
      difficulty: 'normal',
    },
    {
      id: ids[1],
      intent: 'payment_shipping',
      category: 'shipping_policy',
      severity: 'P1',
      user_prompt: 'hacen envios al exterior?',
      expected_behavior: 'Confirmar envio internacional por DHL cuando aplique.',
      failure_mode: 'international_shipping_false_negative',
      non_technical_language_required: true,
      source: 'qa_seed',
      reviewed: true,
      difficulty: 'adversarial',
    },
  ];

  return rows.map((row) => JSON.stringify(row)).join('\n');
}
