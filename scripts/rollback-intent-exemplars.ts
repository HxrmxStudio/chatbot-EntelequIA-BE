import {
  createAnalyticsPool,
  readBooleanEnv,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

type RollbackSnapshot = {
  fallbackRate: number;
  downvoteRate: number;
};

async function main(): Promise<void> {
  const learningEnabled = readBooleanEnv('WF1_RECURSIVE_LEARNING_ENABLED', true);
  const autoRollbackEnabled = readBooleanEnv('WF1_RECURSIVE_AUTO_ROLLBACK_ENABLED', true);
  if (!learningEnabled || !autoRollbackEnabled) {
    // eslint-disable-next-line no-console
    console.log('Auto rollback disabled by env, skipping.');
    return;
  }

  const maxFallbackDelta = readNumberEnv('WF1_RECURSIVE_ROLLBACK_MAX_FALLBACK_DELTA', 0.01);
  const maxDownvoteDelta = readNumberEnv('WF1_RECURSIVE_ROLLBACK_MAX_DOWNVOTE_DELTA', 0.02);

  const pool = createAnalyticsPool();
  const startedAt = new Date().toISOString();

  try {
    const current = await loadSnapshot(pool, `now() - interval '24 hours'`, 'now()');
    const baseline = await loadSnapshot(
      pool,
      `now() - interval '8 days'`,
      `now() - interval '24 hours'`,
    );

    const fallbackDelta = current.fallbackRate - baseline.fallbackRate;
    const downvoteDelta = current.downvoteRate - baseline.downvoteRate;
    const shouldRollback =
      fallbackDelta > maxFallbackDelta || downvoteDelta > maxDownvoteDelta;

    let rolledBack = 0;
    if (shouldRollback) {
      const result = await pool.query(
        `UPDATE wf1_intent_exemplars
         SET enabled = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE enabled = TRUE`,
      );
      rolledBack = result.rowCount ?? 0;
    }

    await pool.query(
      `INSERT INTO wf1_learning_runs (
         run_type,
         status,
         autorolledback,
         summary,
         completed_at
       )
       VALUES (
         'rollback_exemplars',
         'completed',
         $1,
         $2::jsonb,
         CURRENT_TIMESTAMP
       )`,
      [
        rolledBack > 0,
        JSON.stringify({
          startedAt,
          generatedAt: new Date().toISOString(),
          shouldRollback,
          rolledBack,
          current,
          baseline,
          fallbackDelta,
          downvoteDelta,
          thresholds: {
            maxFallbackDelta,
            maxDownvoteDelta,
          },
        }),
      ],
    );

    const reportPath = await writeLocalReport('wf1-rollback-intent-exemplars', {
      startedAt,
      generatedAt: new Date().toISOString(),
      shouldRollback,
      rolledBack,
      current,
      baseline,
      fallbackDelta,
      downvoteDelta,
    });

    // eslint-disable-next-line no-console
    console.log(reportPath);
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function loadSnapshot(
  pool: ReturnType<typeof createAnalyticsPool>,
  fromExpression: string,
  toExpression: string,
): Promise<RollbackSnapshot> {
  const result = await pool.query<{
    fallback_rate: number | null;
    downvote_rate: number | null;
  }>(
    `WITH fallback AS (
       SELECT
         AVG(
           CASE
             WHEN COALESCE(message.metadata->>'fallbackReason', '') <> '' THEN 1.0
             ELSE 0.0
           END
         ) AS fallback_rate
       FROM messages message
       WHERE message.sender = 'bot'
         AND message.created_at >= ${fromExpression}
         AND message.created_at < ${toExpression}
     ),
     feedback AS (
       SELECT AVG(CASE WHEN rating = 'down' THEN 1.0 ELSE 0.0 END) AS downvote_rate
       FROM message_feedback
       WHERE created_at >= ${fromExpression}
         AND created_at < ${toExpression}
     )
     SELECT fallback.fallback_rate, feedback.downvote_rate
     FROM fallback, feedback`,
  );

  const row = result.rows[0];
  return {
    fallbackRate: Number(row?.fallback_rate ?? 0),
    downvoteRate: Number(row?.downvote_rate ?? 0),
  };
}

void main();
