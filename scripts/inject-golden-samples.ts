import type { Pool } from 'pg';
import {
  createAnalyticsPool,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

type InsertedRow = {
  id: string;
  message_id: string;
};

async function main(): Promise<void> {
  const count = Math.max(1, Math.floor(readNumberEnv('WF1_HITL_GOLDEN_COUNT', 3)));
  const pool = createAnalyticsPool();

  try {
    const inserted = await injectGoldenSamples(pool, count);
    const reportPath = await writeLocalReport('hitl-golden-injection', {
      generatedAt: new Date().toISOString(),
      requestedCount: count,
      insertedCount: inserted.length,
      inserted,
    });

    // eslint-disable-next-line no-console
    console.log(reportPath);
  } finally {
    await pool.end();
  }
}

async function injectGoldenSamples(pool: Pool, count: number): Promise<InsertedRow[]> {
  const result = await pool.query<InsertedRow>(
    `WITH selected AS (
       SELECT golden.message_id
       FROM hitl_golden_examples golden
       WHERE golden.active = true
         AND NOT EXISTS (
           SELECT 1
           FROM hitl_review_queue queue
           WHERE queue.message_id = golden.message_id
             AND queue.priority = 'golden_sample'
             AND queue.sampled_at >= now() - interval '7 days'
         )
       ORDER BY random()
       LIMIT $1
     )
     INSERT INTO hitl_review_queue (message_id, priority, metadata)
     SELECT
       selected.message_id,
       'golden_sample',
       jsonb_build_object('source', 'golden')
     FROM selected
     RETURNING id::text AS id, message_id::text AS message_id`,
    [count],
  );

  return result.rows;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

