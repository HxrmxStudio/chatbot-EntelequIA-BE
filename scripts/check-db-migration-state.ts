import type { Pool } from 'pg';
import { createAnalyticsPool } from './_helpers/analytics';

type MigrationStatus = {
  id: string;
  file: string;
  applied: boolean;
  missing: string[];
};

type MigrationDefinition = {
  id: string;
  file: string;
  verify: (pool: Pool) => Promise<{ applied: boolean; missing: string[] }>;
};

const MIGRATIONS: readonly MigrationDefinition[] = [
  {
    id: '09',
    file: 'sql/09_wf1_learning_runs.sql',
    verify: async (pool) => {
      const missing: string[] = [];
      if (!(await tableExists(pool, 'wf1_learning_runs'))) {
        missing.push('table:wf1_learning_runs');
      }
      if (!(await indexExists(pool, 'idx_wf1_learning_runs_type_created'))) {
        missing.push('index:idx_wf1_learning_runs_type_created');
      }
      if (!(await indexExists(pool, 'idx_wf1_learning_runs_status_created'))) {
        missing.push('index:idx_wf1_learning_runs_status_created');
      }
      return { applied: missing.length === 0, missing };
    },
  },
  {
    id: '10',
    file: 'sql/10_wf1_intent_exemplars.sql',
    verify: async (pool) => {
      const missing: string[] = [];
      if (!(await tableExists(pool, 'wf1_intent_exemplars'))) {
        missing.push('table:wf1_intent_exemplars');
      }
      if (!(await indexExists(pool, 'uniq_wf1_intent_exemplars_intent_hint'))) {
        missing.push('index:uniq_wf1_intent_exemplars_intent_hint');
      }
      if (!(await indexExists(pool, 'idx_wf1_intent_exemplars_enabled_intent'))) {
        missing.push('index:idx_wf1_intent_exemplars_enabled_intent');
      }
      if (!(await indexExists(pool, 'idx_wf1_intent_exemplars_updated'))) {
        missing.push('index:idx_wf1_intent_exemplars_updated');
      }
      if (!(await triggerExists(pool, 'trg_wf1_intent_exemplars_updated_at'))) {
        missing.push('trigger:trg_wf1_intent_exemplars_updated_at');
      }
      return { applied: missing.length === 0, missing };
    },
  },
  {
    id: '11',
    file: 'sql/11_conversations_status_ttl_indexes.sql',
    verify: async (pool) => {
      const missing: string[] = [];
      if (!(await tableExists(pool, 'conversations'))) {
        missing.push('table:conversations');
      }
      if (!(await columnExists(pool, 'conversations', 'status'))) {
        missing.push('column:conversations.status');
      }
      if (!(await indexExists(pool, 'idx_conversations_status_updated_at'))) {
        missing.push('index:idx_conversations_status_updated_at');
      }
      return { applied: missing.length === 0, missing };
    },
  },
  {
    id: '12',
    file: 'sql/12_learning_seed_support.sql',
    verify: async (pool) => {
      const missing: string[] = [];
      if (!(await tableExists(pool, 'hitl_golden_examples'))) {
        missing.push('table:hitl_golden_examples');
      }
      if (!(await columnExists(pool, 'hitl_golden_examples', 'source'))) {
        missing.push('column:hitl_golden_examples.source');
      }
      if (!(await indexExists(pool, 'idx_hitl_golden_source_active'))) {
        missing.push('index:idx_hitl_golden_source_active');
      }
      if (
        !(await constraintContains(
          pool,
          'wf1_learning_runs',
          'bootstrap_seeds',
        ))
      ) {
        missing.push('constraint:wf1_learning_runs.run_type includes bootstrap_seeds');
      }
      if (
        !(await constraintContains(
          pool,
          'wf1_intent_exemplars',
          'qa_seed',
        ))
      ) {
        missing.push('constraint:wf1_intent_exemplars.source includes qa_seed');
      }
      if (
        !(await constraintContains(
          pool,
          'hitl_golden_examples',
          'qa_seed',
        ))
      ) {
        missing.push('constraint:hitl_golden_examples.source includes qa_seed');
      }
      return { applied: missing.length === 0, missing };
    },
  },
];

async function main(): Promise<void> {
  const pool = createAnalyticsPool();
  try {
    const results: MigrationStatus[] = [];
    for (const migration of MIGRATIONS) {
      const status = await migration.verify(pool);
      results.push({
        id: migration.id,
        file: migration.file,
        applied: status.applied,
        missing: status.missing,
      });
    }

    const pending = results.filter((item) => !item.applied);
    const payload = {
      generatedAt: new Date().toISOString(),
      ok: pending.length === 0,
      pendingCount: pending.length,
      results,
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload, null, 2));
    if (pending.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
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

async function indexExists(pool: Pool, indexName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = $1
     ) AS exists`,
    [indexName],
  );
  return result.rows[0]?.exists === true;
}

async function triggerExists(pool: Pool, triggerName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
         AND trigger_name = $1
     ) AS exists`,
    [triggerName],
  );
  return result.rows[0]?.exists === true;
}

async function constraintContains(
  pool: Pool,
  tableName: string,
  expectedFragment: string,
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
    [tableName, expectedFragment],
  );
  return result.rows[0]?.exists === true;
}

void main();
