import type { Pool } from 'pg';
import {
  createAnalyticsPool,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

type RetentionPolicy = {
  messagesDays: number;
  evaluationsDays: number;
  hitlDays: number;
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const policy: RetentionPolicy = {
    messagesDays: Math.max(1, Math.floor(readNumberEnv('WF1_RETENTION_MESSAGES_DAYS', 90))),
    evaluationsDays: Math.max(1, Math.floor(readNumberEnv('WF1_RETENTION_EVAL_DAYS', 365))),
    hitlDays: Math.max(1, Math.floor(readNumberEnv('WF1_RETENTION_HITL_DAYS', 365))),
  };

  const pool = createAnalyticsPool();

  try {
    const before = await collectCandidateCounts(pool, policy);

    let deleted = {
      messages: 0,
      responseEvaluations: 0,
      hitlReviewQueue: 0,
      hitlGoldenExamples: 0,
    };

    if (apply) {
      deleted = await prune(pool, policy);
    }

    const after = await collectCandidateCounts(pool, policy);

    const reportPath = await writeLocalReport('analytics-prune-summary', {
      generatedAt: new Date().toISOString(),
      apply,
      policy,
      before,
      deleted,
      after,
    });

    // eslint-disable-next-line no-console
    console.log(reportPath);
  } finally {
    await pool.end();
  }
}

async function collectCandidateCounts(
  pool: Pool,
  policy: RetentionPolicy,
): Promise<Record<string, number>> {
  const [messages, evaluations, queue, golden] = await Promise.all([
    countOlderThan(pool, 'messages', 'created_at', policy.messagesDays),
    countOlderThan(pool, 'response_evaluations', 'created_at', policy.evaluationsDays),
    countOlderThan(pool, 'hitl_review_queue', 'sampled_at', policy.hitlDays),
    countOlderThan(pool, 'hitl_golden_examples', 'created_at', policy.hitlDays),
  ]);

  return {
    messages,
    responseEvaluations: evaluations,
    hitlReviewQueue: queue,
    hitlGoldenExamples: golden,
  };
}

async function prune(
  pool: Pool,
  policy: RetentionPolicy,
): Promise<{
  messages: number;
  responseEvaluations: number;
  hitlReviewQueue: number;
  hitlGoldenExamples: number;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const messages = await deleteOlderThan(
      client,
      'messages',
      'created_at',
      policy.messagesDays,
    );
    const evaluations = await deleteOlderThan(
      client,
      'response_evaluations',
      'created_at',
      policy.evaluationsDays,
    );
    const queue = await deleteOlderThan(
      client,
      'hitl_review_queue',
      'sampled_at',
      policy.hitlDays,
    );
    const golden = await deleteOlderThan(
      client,
      'hitl_golden_examples',
      'created_at',
      policy.hitlDays,
    );

    await client.query('COMMIT');

    return {
      messages,
      responseEvaluations: evaluations,
      hitlReviewQueue: queue,
      hitlGoldenExamples: golden,
    };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function countOlderThan(
  pool: Pool,
  table: string,
  column: string,
  days: number,
): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM ${table}
     WHERE ${column} < now() - make_interval(days => $1::int)`,
    [days],
  );
  return result.rows[0]?.total ?? 0;
}

async function deleteOlderThan(
  pool: { query: Pool['query'] },
  table: string,
  column: string,
  days: number,
): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `WITH deleted AS (
       DELETE FROM ${table}
       WHERE ${column} < now() - make_interval(days => $1::int)
       RETURNING 1
     )
     SELECT COUNT(*)::int AS total
     FROM deleted`,
    [days],
  );

  return result.rows[0]?.total ?? 0;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

