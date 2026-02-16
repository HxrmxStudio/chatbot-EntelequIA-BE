import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { fetchWithTimeout } from '../src/modules/wf1/infrastructure/adapters/shared/http-client';
import { OPENAI_API_BASE_URL } from '../src/modules/wf1/infrastructure/adapters/shared/openai-endpoints';
import {
  createAnalyticsPool,
  readBooleanEnv,
  readNumberEnv,
  readStringEnv,
  requireEnv,
  writeLocalReport,
} from './_helpers/analytics';

type CandidateRow = {
  message_id: string;
  request_id: string | null;
  intent: string | null;
  user_query: string;
  bot_response: string;
  bot_metadata: Record<string, unknown>;
  created_at: string;
};

type JudgeScores = {
  relevance: number;
  completeness: number;
  context_adherence: number;
  role_adherence: number;
  hallucination_flag: boolean;
};

type EvaluatedItem = {
  messageId: string;
  reason: 'fallback' | 'low_score' | 'random';
  inserted: boolean;
  skippedByCache: boolean;
  error: string | null;
};

type BatchStatus = 'submitted' | 'pending' | 'completed' | 'failed_parse_or_persist';

type PreparedCandidate = CandidateRow & {
  reason: 'fallback' | 'low_score' | 'random';
  customId: string;
  contextSnapshot: string;
  inputHash: string;
};

type PendingBatchItem = {
  customId: string;
  messageId: string;
  requestId: string | null;
  intent: string | null;
  reason: 'fallback' | 'low_score' | 'random';
  createdAt: string;
  inputHash: string;
};

type PendingBatchState = {
  version: 1;
  batchId: string;
  model: string;
  submittedAt: string;
  items: PendingBatchItem[];
};

type OpenAiBatch = {
  id: string;
  status: string;
  output_file_id?: string | null;
};

type OpenAiBatchOutputLine = {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: {
      output_text?: string | null;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
  };
  error?: {
    message?: string;
  } | null;
};

const PROMPT_PATH = resolve(
  process.cwd(),
  'prompts/eval/entelequia_response_quality_judge_v1.txt',
);
const BATCH_STATE_PATH = resolve(process.cwd(), 'docs/reports/local/wf1-eval-batch-state.json');

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    relevance: { type: 'number', minimum: 0, maximum: 1 },
    completeness: { type: 'number', minimum: 0, maximum: 1 },
    context_adherence: { type: 'number', minimum: 0, maximum: 1 },
    role_adherence: { type: 'number', minimum: 0, maximum: 1 },
    hallucination_flag: { type: 'boolean' },
  },
  required: [
    'relevance',
    'completeness',
    'context_adherence',
    'role_adherence',
    'hallucination_flag',
  ],
} as const;

async function main(): Promise<void> {
  const enabled = readBooleanEnv('WF1_EVAL_ENABLED', false);
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log('WF1_EVAL_ENABLED=false, skipping.');
    return;
  }

  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = readStringEnv('WF1_EVAL_MODEL', 'gpt-4o-mini');
  const dailyCap = Math.max(0, Math.floor(readNumberEnv('WF1_EVAL_DAILY_CAP', 200)));
  const timeoutMs = Math.max(1000, Math.floor(readNumberEnv('WF1_EVAL_TIMEOUT_MS', 10_000)));
  const randomPercent = Math.min(
    100,
    Math.max(0, readNumberEnv('WF1_EVAL_SAMPLE_RANDOM_PERCENT', 5)),
  );
  const lowScoreThreshold = Math.min(
    1,
    Math.max(0, readNumberEnv('WF1_EVAL_LOW_SCORE_THRESHOLD', 0.6)),
  );

  const judgePrompt = (await readFile(PROMPT_PATH, 'utf8')).trim();
  const pool = createAnalyticsPool();

  try {
    const collected = await collectPendingBatchIfAny({
      apiKey,
      timeoutMs,
      pool,
    });

    if (collected.reportPath) {
      // eslint-disable-next-line no-console
      console.log(collected.reportPath);
      if (collected.batchStatus === 'failed_parse_or_persist') {
        process.exitCode = 1;
        return;
      }
      if (collected.batchStatus === 'pending') {
        return;
      }
    }

    const alreadyToday = await countEvaluationsToday(pool);
    const availableBudget = Math.max(0, dailyCap - alreadyToday);
    if (availableBudget === 0) {
      const reportPath = await writeLocalReport('response-quality-eval-summary', {
        generatedAt: new Date().toISOString(),
        model,
        enabled,
        dailyCap,
        alreadyToday,
        availableBudget,
        selected: 0,
        queuedForBatch: 0,
        cacheHits: 0,
        batchStatus: 'completed',
        inserted: 0,
        failed: 0,
        processed: 0,
      });
      // eslint-disable-next-line no-console
      console.log(reportPath);
      return;
    }

    const candidates = await loadCandidates(pool);
    const selected = selectCandidates(candidates, {
      budget: availableBudget,
      randomPercent,
      lowScoreThreshold,
    });

    const prepared: PreparedCandidate[] = [];
    const evaluated: EvaluatedItem[] = [];
    for (const item of selected) {
      const contextSnapshot = buildContextSnapshot(item);
      const inputHash = createHash('sha256')
        .update(`${item.user_query}\n${item.bot_response}\n${contextSnapshot}`)
        .digest('hex');

      const existsRecent = await hasRecentEvaluation(pool, inputHash);
      if (existsRecent) {
        evaluated.push({
          messageId: item.message_id,
          reason: item.reason,
          inserted: false,
          skippedByCache: true,
          error: null,
        });
        continue;
      }

      prepared.push({
        ...item,
        customId: item.message_id,
        contextSnapshot,
        inputHash,
      });
    }

    if (prepared.length === 0) {
      const reportPath = await writeLocalReport('response-quality-eval-summary', {
        generatedAt: new Date().toISOString(),
        model,
        enabled,
        dailyCap,
        alreadyToday,
        availableBudget,
        selected: selected.length,
        queuedForBatch: 0,
        cacheHits: evaluated.filter((row) => row.skippedByCache).length,
        batchStatus: 'completed',
        inserted: 0,
        failed: 0,
        processed: 0,
        evaluated,
      });
      // eslint-disable-next-line no-console
      console.log(reportPath);
      return;
    }

    const inputFileId = await uploadBatchInputFile({
      apiKey,
      timeoutMs,
      jsonl: buildBatchJsonl({ prepared, model, judgePrompt }),
    });

    const batch = await createBatch({
      apiKey,
      timeoutMs,
      inputFileId,
    });

    const state: PendingBatchState = {
      version: 1,
      batchId: batch.id,
      model,
      submittedAt: new Date().toISOString(),
      items: prepared.map((item) => ({
        customId: item.customId,
        messageId: item.message_id,
        requestId: item.request_id,
        intent: item.intent,
        reason: item.reason,
        createdAt: item.created_at,
        inputHash: item.inputHash,
      })),
    };
    await writeBatchState(state);

    const reportPath = await writeLocalReport('response-quality-eval-summary', {
      generatedAt: new Date().toISOString(),
      model,
      enabled,
      dailyCap,
      alreadyToday,
      availableBudget,
      selected: selected.length,
      queuedForBatch: prepared.length,
      cacheHits: evaluated.filter((row) => row.skippedByCache).length,
      batchStatus: 'submitted',
      batchId: batch.id,
      inserted: 0,
      failed: 0,
      processed: 0,
      evaluated,
    });

    // eslint-disable-next-line no-console
    console.log(reportPath);
  } finally {
    await pool.end();
  }
}

async function collectPendingBatchIfAny(input: {
  apiKey: string;
  timeoutMs: number;
  pool: Pool;
}): Promise<{ batchStatus: BatchStatus | null; reportPath: string | null }> {
  const state = await readBatchState();
  if (!state) {
    return { batchStatus: null, reportPath: null };
  }

  const batch = await fetchBatch({
    apiKey: input.apiKey,
    timeoutMs: input.timeoutMs,
    batchId: state.batchId,
  });

  if (batch.status !== 'completed') {
    const reportPath = await writeLocalReport('response-quality-eval-summary', {
      generatedAt: new Date().toISOString(),
      model: state.model,
      batchStatus: 'pending',
      batchId: state.batchId,
      pendingItems: state.items.length,
      providerStatus: batch.status,
      inserted: 0,
      failed: 0,
      processed: 0,
    });

    return { batchStatus: 'pending', reportPath };
  }

  if (!batch.output_file_id) {
    const reportPath = await writeLocalReport('response-quality-eval-summary', {
      generatedAt: new Date().toISOString(),
      model: state.model,
      batchStatus: 'failed_parse_or_persist',
      batchId: state.batchId,
      error: 'missing_output_file',
      inserted: 0,
      failed: state.items.length,
      processed: 0,
    });
    await clearBatchState();
    return { batchStatus: 'failed_parse_or_persist', reportPath };
  }

  const outputJsonl = await fetchBatchOutputFileContent({
    apiKey: input.apiKey,
    timeoutMs: input.timeoutMs,
    fileId: batch.output_file_id,
  });

  const parsed = parseJsonl<OpenAiBatchOutputLine>(outputJsonl);
  const byCustomId = new Map(state.items.map((item) => [item.customId, item]));

  let inserted = 0;
  let failed = 0;
  let processed = 0;
  for (const line of parsed) {
    const customId = typeof line.custom_id === 'string' ? line.custom_id : null;
    if (!customId) {
      continue;
    }

    const stateItem = byCustomId.get(customId);
    if (!stateItem) {
      continue;
    }

    processed += 1;

    try {
      const scores = extractJudgeScoresFromBatchLine(line);
      const ok = await insertEvaluation(input.pool, {
        messageId: stateItem.messageId,
        requestId: stateItem.requestId,
        intent: stateItem.intent,
        evaluatorModel: state.model,
        scores,
        inputHash: stateItem.inputHash,
        evidence: {
          candidateReason: stateItem.reason,
          createdAt: stateItem.createdAt,
          collectedFromBatch: true,
          batchId: state.batchId,
        },
      });

      if (ok) {
        inserted += 1;
      }
    } catch {
      failed += 1;
    }
  }

  await clearBatchState();

  const batchStatus: BatchStatus = failed > 0 ? 'failed_parse_or_persist' : 'completed';
  const reportPath = await writeLocalReport('response-quality-eval-summary', {
    generatedAt: new Date().toISOString(),
    model: state.model,
    batchStatus,
    batchId: state.batchId,
    inserted,
    failed,
    processed,
  });

  return { batchStatus, reportPath };
}

async function uploadBatchInputFile(input: {
  apiKey: string;
  timeoutMs: number;
  jsonl: string;
}): Promise<string> {
  const body = new FormData();
  body.append('purpose', 'batch');
  body.append('file', new Blob([input.jsonl], { type: 'application/jsonl' }), 'wf1-eval-input.jsonl');

  const response = await fetchWithTimeout(
    `${OPENAI_API_BASE_URL}/v1/files`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      body,
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`batch_file_upload_http_${response.status}`);
  }

  const parsed = (await response.json()) as { id?: string };
  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new Error('batch_file_upload_invalid_response');
  }

  return parsed.id;
}

async function createBatch(input: {
  apiKey: string;
  timeoutMs: number;
  inputFileId: string;
}): Promise<{ id: string }> {
  const response = await fetchWithTimeout(
    `${OPENAI_API_BASE_URL}/v1/batches`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        input_file_id: input.inputFileId,
        endpoint: '/v1/responses',
        completion_window: '24h',
      }),
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`batch_create_http_${response.status}`);
  }

  const parsed = (await response.json()) as { id?: string };
  if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
    throw new Error('batch_create_invalid_response');
  }

  return { id: parsed.id };
}

async function fetchBatch(input: {
  apiKey: string;
  timeoutMs: number;
  batchId: string;
}): Promise<OpenAiBatch> {
  const response = await fetchWithTimeout(
    `${OPENAI_API_BASE_URL}/v1/batches/${encodeURIComponent(input.batchId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`batch_fetch_http_${response.status}`);
  }

  return (await response.json()) as OpenAiBatch;
}

async function fetchBatchOutputFileContent(input: {
  apiKey: string;
  timeoutMs: number;
  fileId: string;
}): Promise<string> {
  const response = await fetchWithTimeout(
    `${OPENAI_API_BASE_URL}/v1/files/${encodeURIComponent(input.fileId)}/content`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`batch_output_file_http_${response.status}`);
  }

  return response.text();
}

function buildBatchJsonl(input: {
  prepared: PreparedCandidate[];
  model: string;
  judgePrompt: string;
}): string {
  return input.prepared
    .map((item) => {
      const line = {
        custom_id: item.customId,
        method: 'POST',
        url: '/v1/responses',
        body: {
          model: input.model,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: input.judgePrompt }],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: buildJudgePayload({
                    userQuery: item.user_query,
                    botResponse: item.bot_response,
                    contextSnapshot: item.contextSnapshot,
                  }),
                },
              ],
            },
          ],
          max_output_tokens: 220,
          temperature: 0,
          text: {
            format: {
              type: 'json_schema',
              name: 'response_quality_judge_v1',
              schema: JUDGE_SCHEMA,
              strict: true,
            },
          },
        },
      };

      return JSON.stringify(line);
    })
    .join('\n');
}

function extractJudgeScoresFromBatchLine(line: OpenAiBatchOutputLine): JudgeScores {
  if (line.error && typeof line.error.message === 'string') {
    throw new Error(`judge_error_${line.error.message}`);
  }

  const statusCode = line.response?.status_code;
  if (typeof statusCode !== 'number' || statusCode < 200 || statusCode >= 300) {
    throw new Error(`judge_http_${statusCode ?? 'unknown'}`);
  }

  const body = line.response?.body;
  const raw =
    body?.output_text ?? body?.output?.[0]?.content?.find((item) => typeof item.text === 'string')?.text;

  if (!raw || raw.trim().length === 0) {
    throw new Error('judge_empty_output');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error('judge_invalid_json');
  }

  return normalizeJudgeScores(decoded);
}

async function readBatchState(): Promise<PendingBatchState | null> {
  try {
    const raw = await readFile(BATCH_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PendingBatchState;
    if (parsed.version !== 1 || typeof parsed.batchId !== 'string' || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeBatchState(state: PendingBatchState): Promise<void> {
  await mkdir(resolve(process.cwd(), 'docs/reports/local'), { recursive: true });
  await writeFile(BATCH_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function clearBatchState(): Promise<void> {
  try {
    await unlink(BATCH_STATE_PATH);
  } catch {
    // ignore
  }
}

async function countEvaluationsToday(pool: Pool): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM response_evaluations
     WHERE created_at >= date_trunc('day', now())`,
  );
  return result.rows[0]?.total ?? 0;
}

async function loadCandidates(pool: Pool): Promise<
  Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }>
> {
  const result = await pool.query<{
    message_id: string;
    request_id: string | null;
    intent: string | null;
    user_query: string;
    bot_response: string;
    bot_metadata: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT
       bot.id::text AS message_id,
       bot.metadata->>'traceId' AS request_id,
       bot.metadata->>'predictedIntent' AS intent,
       user_turn.content AS user_query,
       bot.content AS bot_response,
       COALESCE(bot.metadata, '{}'::jsonb) AS bot_metadata,
       bot.created_at::text AS created_at
     FROM messages bot
     JOIN LATERAL (
       SELECT content
       FROM messages usr
       WHERE usr.conversation_id = bot.conversation_id
         AND usr.external_event_id = bot.external_event_id
         AND usr.sender = 'user'
       ORDER BY usr.created_at DESC
       LIMIT 1
     ) user_turn ON TRUE
     LEFT JOIN response_evaluations eval_today
       ON eval_today.message_id = bot.id
      AND eval_today.created_at >= date_trunc('day', now())
     WHERE bot.sender = 'bot'
       AND eval_today.id IS NULL
       AND bot.created_at >= now() - interval '7 days'
     ORDER BY bot.created_at DESC
     LIMIT 500`,
  );

  return result.rows.map((row) => ({ ...row, reason: 'random' }));
}

function selectCandidates(
  input: Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }>,
  policy: { budget: number; randomPercent: number; lowScoreThreshold: number },
): Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }> {
  const fallback: Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }> = [];
  const lowScore: Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }> = [];
  const rest: Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }> = [];

  for (const row of input) {
    const fallbackReason = readMetadataString(row.bot_metadata, 'fallbackReason');
    const llmPath = readMetadataString(row.bot_metadata, 'llmPath');
    const predictedConfidence = readMetadataNumber(row.bot_metadata, 'predictedConfidence');

    if (fallbackReason !== null || llmPath?.startsWith('fallback_') === true) {
      fallback.push({ ...row, reason: 'fallback' });
      continue;
    }

    if (predictedConfidence !== null && predictedConfidence < policy.lowScoreThreshold) {
      lowScore.push({ ...row, reason: 'low_score' });
      continue;
    }

    rest.push({ ...row, reason: 'random' });
  }

  const selected: Array<CandidateRow & { reason: 'fallback' | 'low_score' | 'random' }> = [];
  for (const row of fallback) {
    if (selected.length >= policy.budget) break;
    selected.push(row);
  }
  for (const row of lowScore) {
    if (selected.length >= policy.budget) break;
    selected.push(row);
  }

  if (selected.length >= policy.budget) {
    return selected;
  }

  const needed = policy.budget - selected.length;
  const randomCandidates = rest
    .filter((row) => deterministicBucket(row.message_id) < policy.randomPercent)
    .sort((a, b) => a.message_id.localeCompare(b.message_id))
    .slice(0, needed);

  return selected.concat(randomCandidates);
}

async function hasRecentEvaluation(pool: Pool, inputHash: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM response_evaluations
       WHERE input_hash = $1
         AND created_at >= now() - interval '24 hours'
     ) AS exists`,
    [inputHash],
  );

  return result.rows[0]?.exists ?? false;
}

async function insertEvaluation(
  pool: Pool,
  input: {
    messageId: string;
    requestId: string | null;
    intent: string | null;
    evaluatorModel: string;
    scores: JudgeScores;
    inputHash: string;
    evidence: Record<string, unknown>;
  },
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO response_evaluations (
       message_id,
       request_id,
       intent,
       evaluator_model,
       relevance,
       completeness,
       context_adherence,
       role_adherence,
       hallucination_flag,
       evidence,
       input_hash
     )
     VALUES (
       $1::uuid,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10::jsonb,
       $11
     )
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      input.messageId,
      input.requestId,
      input.intent,
      input.evaluatorModel,
      input.scores.relevance,
      input.scores.completeness,
      input.scores.context_adherence,
      input.scores.role_adherence,
      input.scores.hallucination_flag,
      JSON.stringify(input.evidence),
      input.inputHash,
    ],
  );

  return (result.rowCount ?? 0) > 0;
}

function buildJudgePayload(input: {
  userQuery: string;
  botResponse: string;
  contextSnapshot: string;
}): string {
  return JSON.stringify(
    {
      user_query: input.userQuery,
      assistant_response: input.botResponse,
      context: input.contextSnapshot,
    },
    null,
    2,
  );
}

function normalizeJudgeScores(value: unknown): JudgeScores {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('judge_schema_invalid');
  }

  const candidate = value as Record<string, unknown>;
  const relevance = clamp01(candidate.relevance);
  const completeness = clamp01(candidate.completeness);
  const contextAdherence = clamp01(candidate.context_adherence);
  const roleAdherence = clamp01(candidate.role_adherence);
  const hallucinationFlag = candidate.hallucination_flag === true;

  return {
    relevance,
    completeness,
    context_adherence: contextAdherence,
    role_adherence: roleAdherence,
    hallucination_flag: hallucinationFlag,
  };
}

function clamp01(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('judge_schema_invalid');
  }

  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

function buildContextSnapshot(row: CandidateRow): string {
  const metadata = row.bot_metadata ?? {};
  const intent = readMetadataString(metadata, 'predictedIntent') ?? row.intent ?? 'unknown';
  const contextTypes = Array.isArray(metadata['contextTypes'])
    ? metadata['contextTypes'].filter((item): item is string => typeof item === 'string')
    : [];
  const fallbackReason = readMetadataString(metadata, 'fallbackReason');

  return JSON.stringify(
    {
      intent,
      contextTypes,
      fallbackReason,
      responsePolicyVersion: readMetadataString(metadata, 'responsePolicyVersion'),
      llmPath: readMetadataString(metadata, 'llmPath'),
      promptVersion: readMetadataString(metadata, 'promptVersion'),
    },
    null,
    2,
  );
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function deterministicBucket(seed: string): number {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  return parseInt(digest, 16) % 100;
}

function parseJsonl<T>(raw: string): T[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
