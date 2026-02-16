import { createAnalyticsPool, readBooleanEnv, writeLocalReport } from './_helpers/analytics';

type FeedbackCluster = {
  intent: string;
  category: string;
  total: number;
};

async function main(): Promise<void> {
  const enabled = readBooleanEnv('WF1_RECURSIVE_LEARNING_ENABLED', true);
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log('WF1_RECURSIVE_LEARNING_ENABLED=false, skipping.');
    return;
  }

  const pool = createAnalyticsPool();
  const startedAt = new Date().toISOString();

  try {
    const runId = await insertRun(pool, {
      runType: 'build_exemplars',
      status: 'started',
      summary: { startedAt },
    });

    const clusters = await loadFeedbackClusters(pool);
    let upserted = 0;

    for (const cluster of clusters) {
      const hint = buildPromptHint(cluster.intent, cluster.category);
      const confidenceWeight = Math.min(0.95, Number((0.5 + cluster.total / 100).toFixed(4)));

      const result = await pool.query(
        `INSERT INTO wf1_intent_exemplars (
           intent,
           prompt_hint,
           confidence_weight,
           source,
           evidence,
           enabled
         )
         VALUES ($1, $2, $3, 'feedback', $4::jsonb, TRUE)
         ON CONFLICT (intent, prompt_hint)
         DO UPDATE
           SET confidence_weight = GREATEST(wf1_intent_exemplars.confidence_weight, EXCLUDED.confidence_weight),
               evidence = EXCLUDED.evidence,
               enabled = TRUE,
               updated_at = CURRENT_TIMESTAMP`,
        [
          normalizeIntent(cluster.intent),
          hint,
          confidenceWeight,
          JSON.stringify({
            category: cluster.category,
            samples: cluster.total,
          }),
        ],
      );

      upserted += result.rowCount ?? 0;
    }

    await completeRun(pool, {
      runId,
      status: 'completed',
      summary: {
        startedAt,
        generatedAt: new Date().toISOString(),
        clusters: clusters.length,
        upserted,
      },
    });

    const reportPath = await writeLocalReport('wf1-build-intent-exemplars', {
      startedAt,
      generatedAt: new Date().toISOString(),
      clusters: clusters.length,
      upserted,
      sample: clusters.slice(0, 10),
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

async function loadFeedbackClusters(
  pool: ReturnType<typeof createAnalyticsPool>,
): Promise<FeedbackCluster[]> {
  const result = await pool.query<FeedbackCluster>(
    `SELECT
       COALESCE(message.metadata->>'predictedIntent', 'general') AS intent,
       COALESCE(feedback.category, 'other') AS category,
       COUNT(*)::int AS total
     FROM message_feedback feedback
     JOIN messages message ON message.id = feedback.message_id
     WHERE feedback.rating = 'down'
       AND feedback.created_at >= now() - interval '14 days'
     GROUP BY 1, 2
     HAVING COUNT(*) >= 3
     ORDER BY total DESC`,
  );

  return result.rows;
}

function buildPromptHint(intent: string, category: string): string {
  if (intent === 'orders') {
    return 'En consultas de pedidos, evita ambiguedades y confirma claramente el siguiente paso accionable.';
  }

  if (intent === 'recommendations') {
    return 'En recomendaciones, prioriza sugerencias concretas y evita respuestas vacias; si falta precision, pregunta por tipo o tomo.';
  }

  if (intent === 'payment_shipping') {
    return 'En envios y pagos, responde directo con politicas vigentes y evita contradicciones.';
  }

  if (category === 'tone') {
    return 'Mantene tono rioplatense claro, amable y sin jerga tecnica interna.';
  }

  if (category === 'accuracy') {
    return 'Verifica consistencia factual antes de responder y evita afirmar datos inciertos.';
  }

  return 'Responde con claridad, accion concreta y continuidad conversacional, evitando lenguaje tecnico.';
}

function normalizeIntent(intent: string): string {
  const normalized = intent.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'general';
  }

  return normalized.slice(0, 64);
}

async function insertRun(
  pool: ReturnType<typeof createAnalyticsPool>,
  input: {
    runType: string;
    status: 'started' | 'completed' | 'failed';
    summary: Record<string, unknown>;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO wf1_learning_runs (run_type, status, summary)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id::text`,
    [input.runType, input.status, JSON.stringify(input.summary)],
  );

  return result.rows[0]?.id ?? '';
}

async function completeRun(
  pool: ReturnType<typeof createAnalyticsPool>,
  input: {
    runId: string;
    status: 'completed' | 'failed';
    summary: Record<string, unknown>;
  },
): Promise<void> {
  if (!input.runId) {
    return;
  }

  await pool.query(
    `UPDATE wf1_learning_runs
     SET status = $2,
         summary = $3::jsonb,
         completed_at = CURRENT_TIMESTAMP
     WHERE id = $1::uuid`,
    [input.runId, input.status, JSON.stringify(input.summary)],
  );
}

void main();
