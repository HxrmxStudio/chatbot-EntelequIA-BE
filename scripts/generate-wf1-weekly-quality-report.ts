import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAnalyticsPool, writeLocalReport } from './_helpers/analytics';

type WeeklyKpi = {
  fallbackRate: number;
  semanticScore: number;
  hallucinationRate: number;
  feedbackTotal: number;
  downvoteRate: number;
  evalTotal: number;
  hitlPending: number;
};

async function main(): Promise<void> {
  const pool = createAnalyticsPool();

  try {
    const current = await loadWeeklyKpi(pool, `now() - interval '7 days'`, 'now()');
    const previous = await loadWeeklyKpi(
      pool,
      `now() - interval '14 days'`,
      `now() - interval '7 days'`,
    );
    const topFallbackIntents = await loadTopFallbackIntents(pool);
    const topFeedbackReasons = await loadTopFeedbackReasons(pool);

    const payload = {
      generatedAt: new Date().toISOString(),
      current,
      previous,
      deltas: {
        fallbackRate: current.fallbackRate - previous.fallbackRate,
        semanticScore: current.semanticScore - previous.semanticScore,
        hallucinationRate: current.hallucinationRate - previous.hallucinationRate,
        downvoteRate: current.downvoteRate - previous.downvoteRate,
      },
      topFallbackIntents,
      topFeedbackReasons,
    };

    await pool.query(
      `INSERT INTO wf1_learning_runs (run_type, status, summary, completed_at)
       VALUES ('weekly_report', 'completed', $1::jsonb, CURRENT_TIMESTAMP)`,
      [JSON.stringify(payload)],
    );

    const jsonPath = await writeLocalReport('wf1-weekly-quality-report', payload);
    const markdownPath = await writeMarkdownReport(payload);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ jsonPath, markdownPath }, null, 2));
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function loadWeeklyKpi(
  pool: ReturnType<typeof createAnalyticsPool>,
  fromExpression: string,
  toExpression: string,
): Promise<WeeklyKpi> {
  const result = await pool.query<{
    fallback_rate: number | null;
    semantic_score: number | null;
    hallucination_rate: number | null;
    feedback_total: number;
    downvote_rate: number | null;
    eval_total: number;
    hitl_pending: number;
  }>(
    `WITH bot_messages AS (
       SELECT metadata
       FROM messages
       WHERE sender = 'bot'
         AND created_at >= ${fromExpression}
         AND created_at < ${toExpression}
     ),
     evals AS (
       SELECT
         COUNT(*)::int AS eval_total,
         AVG((relevance + completeness + context_adherence + role_adherence) / 4.0) AS semantic_score,
         AVG(CASE WHEN hallucination_flag THEN 1.0 ELSE 0.0 END) AS hallucination_rate
       FROM response_evaluations
       WHERE created_at >= ${fromExpression}
         AND created_at < ${toExpression}
     ),
     feedback AS (
       SELECT
         COUNT(*)::int AS feedback_total,
         AVG(CASE WHEN rating = 'down' THEN 1.0 ELSE 0.0 END) AS downvote_rate
       FROM message_feedback
       WHERE created_at >= ${fromExpression}
         AND created_at < ${toExpression}
     ),
     hitl AS (
       SELECT COUNT(*)::int AS hitl_pending
       FROM hitl_review_queue
       WHERE reviewed_at IS NULL
     )
     SELECT
       (
         SELECT AVG(
           CASE
             WHEN COALESCE(bot_messages.metadata->>'fallbackReason', '') <> '' THEN 1.0
             ELSE 0.0
           END
         )
         FROM bot_messages
       ) AS fallback_rate,
       evals.semantic_score,
       evals.hallucination_rate,
       feedback.feedback_total,
       feedback.downvote_rate,
       evals.eval_total,
       hitl.hitl_pending
     FROM evals, feedback, hitl`,
  );

  const row = result.rows[0];
  return {
    fallbackRate: Number(row?.fallback_rate ?? 0),
    semanticScore: Number(row?.semantic_score ?? 0),
    hallucinationRate: Number(row?.hallucination_rate ?? 0),
    feedbackTotal: row?.feedback_total ?? 0,
    downvoteRate: Number(row?.downvote_rate ?? 0),
    evalTotal: row?.eval_total ?? 0,
    hitlPending: row?.hitl_pending ?? 0,
  };
}

async function loadTopFallbackIntents(
  pool: ReturnType<typeof createAnalyticsPool>,
): Promise<Array<{ intent: string; total: number }>> {
  const result = await pool.query<{ intent: string; total: number }>(
    `SELECT
       COALESCE(metadata->>'predictedIntent', 'unknown') AS intent,
       COUNT(*)::int AS total
     FROM messages
     WHERE sender = 'bot'
       AND created_at >= now() - interval '7 days'
       AND COALESCE(metadata->>'fallbackReason', '') <> ''
     GROUP BY 1
     ORDER BY total DESC
     LIMIT 5`,
  );

  return result.rows;
}

async function loadTopFeedbackReasons(
  pool: ReturnType<typeof createAnalyticsPool>,
): Promise<Array<{ category: string; total: number }>> {
  const result = await pool.query<{ category: string; total: number }>(
    `SELECT COALESCE(category, 'other') AS category, COUNT(*)::int AS total
     FROM message_feedback
     WHERE created_at >= now() - interval '7 days'
       AND rating = 'down'
     GROUP BY 1
     ORDER BY total DESC
     LIMIT 5`,
  );

  return result.rows;
}

async function writeMarkdownReport(payload: {
  generatedAt: string;
  current: WeeklyKpi;
  previous: WeeklyKpi;
  deltas: Record<string, number>;
  topFallbackIntents: Array<{ intent: string; total: number }>;
  topFeedbackReasons: Array<{ category: string; total: number }>;
}): Promise<string> {
  const outDir = resolve(process.cwd(), 'docs/reports/local');
  await mkdir(outDir, { recursive: true });

  const filePath = resolve(outDir, `wf1-weekly-quality-report-${Date.now()}.md`);
  const markdown = [
    '# WF1 Weekly Quality Report',
    '',
    `Generated at: ${payload.generatedAt}`,
    '',
    '## KPIs',
    `- Fallback rate: ${(payload.current.fallbackRate * 100).toFixed(2)}% (delta ${(payload.deltas.fallbackRate * 100).toFixed(2)}pp)`,
    `- Semantic score: ${payload.current.semanticScore.toFixed(3)} (delta ${payload.deltas.semanticScore.toFixed(3)})`,
    `- Hallucination rate: ${(payload.current.hallucinationRate * 100).toFixed(2)}% (delta ${(payload.deltas.hallucinationRate * 100).toFixed(2)}pp)`,
    `- Downvote rate: ${(payload.current.downvoteRate * 100).toFixed(2)}% (delta ${(payload.deltas.downvoteRate * 100).toFixed(2)}pp)`,
    `- Feedback count: ${payload.current.feedbackTotal}`,
    `- Evaluation count: ${payload.current.evalTotal}`,
    `- HITL pending queue: ${payload.current.hitlPending}`,
    '',
    '## Top fallback intents',
    ...payload.topFallbackIntents.map((row) => `- ${row.intent}: ${row.total}`),
    '',
    '## Top negative feedback categories',
    ...payload.topFeedbackReasons.map((row) => `- ${row.category}: ${row.total}`),
    '',
  ].join('\n');

  await writeFile(filePath, markdown, 'utf8');
  return filePath;
}

void main();
