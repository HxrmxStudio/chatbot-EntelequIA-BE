import {
  createAnalyticsPool,
  readBooleanEnv,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

type QualitySnapshot = {
  evalCount: number;
  feedbackCount: number;
  semanticScore: number;
  fallbackRate: number;
  hallucinationRate: number;
  downvoteRate: number;
};

async function main(): Promise<void> {
  const learningEnabled = readBooleanEnv('WF1_RECURSIVE_LEARNING_ENABLED', true);
  const autopromoteEnabled = readBooleanEnv('WF1_RECURSIVE_AUTOPROMOTE_ENABLED', true);
  if (!learningEnabled || !autopromoteEnabled) {
    // eslint-disable-next-line no-console
    console.log('Autopromote disabled by env, skipping.');
    return;
  }

  const minEvalSamples = Math.max(1, readNumberEnv('WF1_RECURSIVE_MIN_EVAL_SAMPLES', 120));
  const minFeedbackSamples = Math.max(1, readNumberEnv('WF1_RECURSIVE_MIN_FEEDBACK_SAMPLES', 20));
  const minSemanticLift = readNumberEnv('WF1_RECURSIVE_MIN_SEMANTIC_LIFT', 0.03);
  const maxFallbackDelta = readNumberEnv('WF1_RECURSIVE_MAX_FALLBACK_DELTA', 0.005);
  const maxHallucinationDelta = readNumberEnv('WF1_RECURSIVE_MAX_HALLUCINATION_DELTA', 0.002);

  const pool = createAnalyticsPool();
  const startedAt = new Date().toISOString();

  try {
    const current = await loadSnapshot(pool, `now() - interval '7 days'`, 'now()');
    const previous = await loadSnapshot(
      pool,
      `now() - interval '14 days'`,
      `now() - interval '7 days'`,
    );

    const semanticLift = current.semanticScore - previous.semanticScore;
    const fallbackDelta = current.fallbackRate - previous.fallbackRate;
    const hallucinationDelta = current.hallucinationRate - previous.hallucinationRate;

    const canPromote =
      current.evalCount >= minEvalSamples &&
      current.feedbackCount >= minFeedbackSamples &&
      semanticLift >= minSemanticLift &&
      fallbackDelta <= maxFallbackDelta &&
      hallucinationDelta <= maxHallucinationDelta;

    let promoted = 0;
    if (canPromote) {
      const result = await pool.query<{ id: string }>(
        `WITH candidates AS (
           SELECT id
           FROM wf1_intent_exemplars
           WHERE enabled = FALSE
           ORDER BY confidence_weight DESC, updated_at DESC
           LIMIT 5
         )
         UPDATE wf1_intent_exemplars exemplar
         SET enabled = TRUE,
             updated_at = CURRENT_TIMESTAMP
         FROM candidates
         WHERE exemplar.id = candidates.id
         RETURNING exemplar.id::text`,
      );
      promoted = result.rowCount ?? 0;
    }

    await pool.query(
      `INSERT INTO wf1_learning_runs (
         run_type,
         status,
         autopromoted,
         summary,
         completed_at
       )
       VALUES (
         'promote_exemplars',
         'completed',
         $1,
         $2::jsonb,
         CURRENT_TIMESTAMP
       )`,
      [
        promoted > 0,
        JSON.stringify({
          startedAt,
          generatedAt: new Date().toISOString(),
          promoted,
          canPromote,
          gates: {
            minEvalSamples,
            minFeedbackSamples,
            minSemanticLift,
            maxFallbackDelta,
            maxHallucinationDelta,
          },
          current,
          previous,
        }),
      ],
    );

    const reportPath = await writeLocalReport('wf1-promote-intent-exemplars', {
      startedAt,
      generatedAt: new Date().toISOString(),
      promoted,
      canPromote,
      current,
      previous,
      semanticLift,
      fallbackDelta,
      hallucinationDelta,
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
): Promise<QualitySnapshot> {
  const result = await pool.query<{
    eval_count: number;
    feedback_count: number;
    semantic_score: number | null;
    fallback_rate: number | null;
    hallucination_rate: number | null;
    downvote_rate: number | null;
  }>(
    `WITH evals AS (
       SELECT
         COUNT(*)::int AS eval_count,
         AVG((relevance + completeness + context_adherence + role_adherence) / 4.0) AS semantic_score,
         AVG(CASE WHEN hallucination_flag THEN 1.0 ELSE 0.0 END) AS hallucination_rate
       FROM response_evaluations
       WHERE created_at >= ${fromExpression}
         AND created_at < ${toExpression}
     ),
     fallback AS (
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
       SELECT
         COUNT(*)::int AS feedback_count,
         AVG(CASE WHEN rating = 'down' THEN 1.0 ELSE 0.0 END) AS downvote_rate
       FROM message_feedback
       WHERE created_at >= ${fromExpression}
         AND created_at < ${toExpression}
     )
     SELECT
       COALESCE(evals.eval_count, 0) AS eval_count,
       COALESCE(feedback.feedback_count, 0) AS feedback_count,
       evals.semantic_score,
       fallback.fallback_rate,
       evals.hallucination_rate,
       feedback.downvote_rate
     FROM evals, fallback, feedback`,
  );

  const row = result.rows[0];
  return {
    evalCount: row?.eval_count ?? 0,
    feedbackCount: row?.feedback_count ?? 0,
    semanticScore: Number(row?.semantic_score ?? 0),
    fallbackRate: Number(row?.fallback_rate ?? 0),
    hallucinationRate: Number(row?.hallucination_rate ?? 0),
    downvoteRate: Number(row?.downvote_rate ?? 0),
  };
}

void main();
