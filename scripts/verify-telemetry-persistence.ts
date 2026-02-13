import type { Pool } from 'pg';
import {
  createAnalyticsPool,
  readBooleanEnv,
  writeLocalReport,
} from './_helpers/analytics';

type TableStatus = {
  table: string;
  exists: boolean;
};

type Diagnostics = {
  level: 'info' | 'warn' | 'error';
  message: string;
};

const REQUIRED_TABLES = [
  'message_feedback',
  'response_evaluations',
  'hitl_review_queue',
  'hitl_golden_examples',
  'wf1_learning_runs',
  'wf1_intent_exemplars',
] as const;

async function main(): Promise<void> {
  const pool = createAnalyticsPool();
  try {
    const tableStatus: TableStatus[] = await Promise.all(
      REQUIRED_TABLES.map(async (table) => ({
        table,
        exists: await tableExists(pool, table),
      })),
    );

    const missingTables = tableStatus.filter((item) => !item.exists).map((item) => item.table);

    const counts = await loadCounts(pool, new Set(tableStatus.filter((row) => row.exists).map((row) => row.table)));
    const diagnostics = buildDiagnostics({
      counts,
      missingTables,
      evalEnabled: readBooleanEnv('WF1_EVAL_ENABLED', false),
      recursiveLearningEnabled: readBooleanEnv('WF1_RECURSIVE_LEARNING_ENABLED', true),
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      ok: missingTables.length === 0,
      tableStatus,
      counts,
      diagnostics,
    };

    const reportPath = await writeLocalReport('wf1-telemetry-persistence', payload);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ...payload,
          reportPath,
        },
        null,
        2,
      ),
    );

    if (missingTables.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

async function loadCounts(
  pool: Pool,
  existingTables: Set<string>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  counts['messages_bot_24h'] = await scalarCount(
    pool,
    `SELECT COUNT(*)::int AS total
     FROM messages
     WHERE sender = 'bot'
       AND created_at >= now() - interval '24 hours'`,
  );

  counts['message_feedback_24h'] = existingTables.has('message_feedback')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM message_feedback
         WHERE created_at >= now() - interval '24 hours'`,
      )
    : 0;

  counts['response_evaluations_24h'] = existingTables.has('response_evaluations')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM response_evaluations
         WHERE created_at >= now() - interval '24 hours'`,
      )
    : 0;

  counts['hitl_review_queue_pending'] = existingTables.has('hitl_review_queue')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM hitl_review_queue
         WHERE reviewed_at IS NULL`,
      )
    : 0;

  counts['hitl_review_queue_7d'] = existingTables.has('hitl_review_queue')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM hitl_review_queue
         WHERE sampled_at >= now() - interval '7 days'`,
      )
    : 0;

  counts['hitl_golden_examples_active'] = existingTables.has('hitl_golden_examples')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM hitl_golden_examples
         WHERE active = true`,
      )
    : 0;

  counts['wf1_learning_runs_7d'] = existingTables.has('wf1_learning_runs')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM wf1_learning_runs
         WHERE created_at >= now() - interval '7 days'`,
      )
    : 0;

  counts['wf1_intent_exemplars_total'] = existingTables.has('wf1_intent_exemplars')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM wf1_intent_exemplars`,
      )
    : 0;

  counts['wf1_intent_exemplars_enabled'] = existingTables.has('wf1_intent_exemplars')
    ? await scalarCount(
        pool,
        `SELECT COUNT(*)::int AS total
         FROM wf1_intent_exemplars
         WHERE enabled = true`,
      )
    : 0;

  return counts;
}

function buildDiagnostics(input: {
  counts: Record<string, number>;
  missingTables: string[];
  evalEnabled: boolean;
  recursiveLearningEnabled: boolean;
}): Diagnostics[] {
  const diagnostics: Diagnostics[] = [];

  if (input.missingTables.length > 0) {
    diagnostics.push({
      level: 'error',
      message: `Missing telemetry tables: ${input.missingTables.join(', ')}.`,
    });
    return diagnostics;
  }

  if (input.counts['messages_bot_24h'] === 0) {
    diagnostics.push({
      level: 'warn',
      message: 'No bot messages in the last 24h; telemetry sampling may look empty by design.',
    });
  }

  if (input.counts['message_feedback_24h'] === 0) {
    diagnostics.push({
      level: 'info',
      message: 'No feedback received in last 24h. Verify FE feedback widget traffic.',
    });
  }

  if (input.counts['response_evaluations_24h'] === 0) {
    diagnostics.push({
      level: input.evalEnabled ? 'warn' : 'info',
      message: input.evalEnabled
        ? 'WF1_EVAL_ENABLED=true but response_evaluations has no rows in 24h; check quality-loop job execution.'
        : 'WF1_EVAL_ENABLED=false, response_evaluations inactivity is expected.',
    });
  }

  if (input.counts['hitl_review_queue_7d'] === 0) {
    diagnostics.push({
      level: 'warn',
      message: 'No HITL queue samples in last 7d; verify enqueue-hitl-review-samples.ts workflow.',
    });
  }

  if (input.counts['wf1_learning_runs_7d'] === 0) {
    diagnostics.push({
      level: input.recursiveLearningEnabled ? 'warn' : 'info',
      message: input.recursiveLearningEnabled
        ? 'WF1_RECURSIVE_LEARNING_ENABLED=true but no wf1_learning_runs in 7d; check weekly loop jobs.'
        : 'WF1_RECURSIVE_LEARNING_ENABLED=false, no wf1_learning_runs is expected.',
    });
  }

  if (input.counts['wf1_intent_exemplars_total'] === 0) {
    diagnostics.push({
      level: 'warn',
      message: 'No intent exemplars loaded yet; run build/promote scripts or verify learning workflow.',
    });
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      level: 'info',
      message: 'Telemetry and learning tables are present and receiving data.',
    });
  }

  return diagnostics;
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

async function scalarCount(pool: Pool, query: string): Promise<number> {
  const result = await pool.query<{ total: number }>(query);
  return result.rows[0]?.total ?? 0;
}

void main();
