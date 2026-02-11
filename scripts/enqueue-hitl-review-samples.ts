import type { Pool } from 'pg';
import {
  createAnalyticsPool,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

type QueueInsertRow = {
  id: string;
  message_id: string;
};

async function main(): Promise<void> {
  const dailyCap = Math.max(0, Math.floor(readNumberEnv('WF1_HITL_DAILY_CAP', 50)));
  const qualityThreshold = Math.min(
    1,
    Math.max(0, readNumberEnv('WF1_EVAL_LOW_SCORE_THRESHOLD', 0.6)),
  );
  const randomCap = Math.max(0, Math.floor(readNumberEnv('WF1_HITL_RANDOM_SAMPLE_CAP', 5)));

  const pool = createAnalyticsPool();

  try {
    const queuedToday = await countQueuedToday(pool);
    let budget = Math.max(0, dailyCap - queuedToday);

    const inserted: {
      fallback: number;
      lowScore: number;
      random: number;
    } = { fallback: 0, lowScore: 0, random: 0 };

    if (budget > 0) {
      inserted.fallback = await enqueueFallback(pool, budget);
      budget -= inserted.fallback;
    }

    if (budget > 0) {
      inserted.lowScore = await enqueueLowScore(pool, budget, qualityThreshold);
      budget -= inserted.lowScore;
    }

    if (budget > 0 && randomCap > 0) {
      inserted.random = await enqueueRandom(pool, Math.min(budget, randomCap));
      budget -= inserted.random;
    }

    const reportPath = await writeLocalReport('hitl-enqueue-summary', {
      generatedAt: new Date().toISOString(),
      dailyCap,
      queuedToday,
      remainingBudget: budget,
      inserted,
      qualityThreshold,
      randomCap,
    });

    // eslint-disable-next-line no-console
    console.log(reportPath);
  } finally {
    await pool.end();
  }
}

async function countQueuedToday(pool: Pool): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM hitl_review_queue
     WHERE sampled_at >= date_trunc('day', now())`,
  );
  return result.rows[0]?.total ?? 0;
}

async function enqueueFallback(pool: Pool, limit: number): Promise<number> {
  if (limit <= 0) return 0;

  const result = await pool.query<QueueInsertRow>(
    `WITH candidates AS (
       SELECT bot.id AS message_id
       FROM messages bot
       WHERE bot.sender = 'bot'
         AND bot.created_at >= now() - interval '14 days'
         AND (
           (bot.metadata->>'fallbackReason') IS NOT NULL OR
           COALESCE(bot.metadata->>'llmPath', '') LIKE 'fallback_%'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM hitl_review_queue queue
           WHERE queue.message_id = bot.id
         )
       ORDER BY bot.created_at DESC
       LIMIT $1
     )
     INSERT INTO hitl_review_queue (message_id, priority, metadata)
     SELECT
       candidates.message_id,
       'high_confidence_error',
       jsonb_build_object('source', 'fallback')
     FROM candidates
     RETURNING id::text AS id, message_id::text AS message_id`,
    [limit],
  );

  return result.rowCount ?? 0;
}

async function enqueueLowScore(
  pool: Pool,
  limit: number,
  threshold: number,
): Promise<number> {
  if (limit <= 0) return 0;

  const result = await pool.query<QueueInsertRow>(
    `WITH low_scores AS (
       SELECT DISTINCT eval.message_id
       FROM response_evaluations eval
       WHERE eval.created_at >= now() - interval '14 days'
         AND (
           eval.relevance < $2 OR
           eval.completeness < $2 OR
           eval.context_adherence < $2 OR
           eval.role_adherence < $2 OR
           eval.hallucination_flag = true
         )
       ORDER BY eval.message_id
       LIMIT $1
     )
     INSERT INTO hitl_review_queue (message_id, priority, metadata)
     SELECT
       low_scores.message_id,
       'high_confidence_error',
       jsonb_build_object('source', 'low_score', 'threshold', $2)
     FROM low_scores
     WHERE NOT EXISTS (
       SELECT 1
       FROM hitl_review_queue queue
       WHERE queue.message_id = low_scores.message_id
     )
     RETURNING id::text AS id, message_id::text AS message_id`,
    [limit, threshold],
  );

  return result.rowCount ?? 0;
}

async function enqueueRandom(pool: Pool, limit: number): Promise<number> {
  if (limit <= 0) return 0;

  const result = await pool.query<QueueInsertRow>(
    `WITH candidates AS (
       SELECT bot.id AS message_id
       FROM messages bot
       WHERE bot.sender = 'bot'
         AND bot.created_at >= now() - interval '7 days'
         AND NOT EXISTS (
           SELECT 1
           FROM hitl_review_queue queue
           WHERE queue.message_id = bot.id
         )
       ORDER BY random()
       LIMIT $1
     )
     INSERT INTO hitl_review_queue (message_id, priority, metadata)
     SELECT
       candidates.message_id,
       'random_sample',
       jsonb_build_object('source', 'random')
     FROM candidates
     RETURNING id::text AS id, message_id::text AS message_id`,
    [limit],
  );

  return result.rowCount ?? 0;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

