import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import {
  createAnalyticsPool,
  readNumberEnv,
  writeLocalReport,
} from './_helpers/analytics';

type DatasetRow = {
  review_id: string;
  quality_label: string;
  issues: string[] | null;
  corrected_response: string | null;
  bot_response: string;
  bot_metadata: Record<string, unknown>;
  user_query: string | null;
  reviewed_at: string;
  source: string | null;
};

type TrainingExample = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  metadata: {
    reviewId: string;
    intent: string | null;
    qualityLabel: string;
    issues: string[];
    hitlReviewed: true;
    source: string | null;
    reviewedAt: string;
  };
};

async function main(): Promise<void> {
  const limit = Math.max(1, Math.floor(readNumberEnv('WF1_EXPORT_DATASET_LIMIT', 1000)));
  const minQuality = readQualityFilter(process.argv);
  const pool = createAnalyticsPool();

  try {
    const rows = await loadRows(pool, limit, minQuality);
    const dataset = rows
      .map((row) => toTrainingExample(row))
      .filter((row): row is TrainingExample => row !== null);

    const outDir = resolve(process.cwd(), 'docs/reports/local');
    const datasetPath = resolve(outDir, `training-dataset-${Date.now()}.json`);
    await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

    const reportPath = await writeLocalReport('training-dataset-export-summary', {
      generatedAt: new Date().toISOString(),
      limit,
      minQuality,
      exportedCount: dataset.length,
      datasetPath,
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ datasetPath, reportPath }, null, 2));
  } finally {
    await pool.end();
  }
}

async function loadRows(
  pool: Pool,
  limit: number,
  minQuality: Array<'excellent' | 'good' | 'acceptable' | 'poor' | 'failed'>,
): Promise<DatasetRow[]> {
  const result = await pool.query<DatasetRow>(
    `SELECT
       queue.id::text AS review_id,
       queue.quality_label,
       queue.issues,
       queue.corrected_response,
       bot_turn.content AS bot_response,
       COALESCE(bot_turn.metadata, '{}'::jsonb) AS bot_metadata,
       user_turn.content AS user_query,
       queue.reviewed_at::text AS reviewed_at,
       bot_turn.channel::text AS source
     FROM hitl_review_queue queue
     JOIN messages bot_turn ON bot_turn.id = queue.message_id
     LEFT JOIN LATERAL (
       SELECT content
       FROM messages usr
       WHERE usr.conversation_id = bot_turn.conversation_id
         AND usr.external_event_id = bot_turn.external_event_id
         AND usr.sender = 'user'
       ORDER BY usr.created_at DESC
       LIMIT 1
     ) user_turn ON TRUE
     WHERE queue.reviewed_at IS NOT NULL
       AND queue.quality_label = ANY($1::text[])
     ORDER BY queue.reviewed_at DESC
     LIMIT $2`,
    [minQuality, limit],
  );

  return result.rows;
}

function toTrainingExample(row: DatasetRow): TrainingExample | null {
  if (!row.user_query || row.user_query.trim().length === 0) {
    return null;
  }

  const assistantContent = row.corrected_response?.trim() || row.bot_response.trim();
  if (assistantContent.length === 0) {
    return null;
  }

  const intent = readMetadataString(row.bot_metadata, 'predictedIntent');

  return {
    messages: [
      {
        role: 'system',
        content:
          'Sos el asistente virtual de Entelequia. Responde en espanol rioplatense, claro y util.',
      },
      {
        role: 'user',
        content: row.user_query.trim(),
      },
      {
        role: 'assistant',
        content: assistantContent,
      },
    ],
    metadata: {
      reviewId: row.review_id,
      intent,
      qualityLabel: row.quality_label,
      issues: (row.issues ?? []).map((issue) => issue.trim()).filter((issue) => issue.length > 0),
      hitlReviewed: true,
      source: row.source,
      reviewedAt: row.reviewed_at,
    },
  };
}

function readQualityFilter(
  argv: string[],
): Array<'excellent' | 'good' | 'acceptable' | 'poor' | 'failed'> {
  const valid = ['excellent', 'good', 'acceptable', 'poor', 'failed'] as const;
  const arg = findArg(argv, '--quality');
  if (!arg) {
    return ['excellent', 'good', 'acceptable'];
  }

  const list = arg
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is (typeof valid)[number] => valid.includes(value as (typeof valid)[number]));

  return list.length > 0 ? list : ['excellent', 'good', 'acceptable'];
}

function findArg(argv: string[], name: string): string | null {
  const index = argv.findIndex((value) => value === name);
  const candidate = index >= 0 ? argv[index + 1] : undefined;
  if (!candidate || candidate.startsWith('--')) {
    return null;
  }
  return candidate;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

