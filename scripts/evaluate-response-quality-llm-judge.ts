import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { fetchWithTimeout } from '../src/modules/wf1/infrastructure/adapters/shared/http-client';
import { openaiResponsesUrl } from '../src/modules/wf1/infrastructure/adapters/openai/endpoints';
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

const PROMPT_PATH = resolve(
  process.cwd(),
  'prompts/eval/entelequia_response_quality_judge_v1.txt',
);

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
        evaluated: [],
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

      try {
        const scores = await evaluateWithJudge({
          apiKey,
          model,
          timeoutMs,
          prompt: judgePrompt,
          userQuery: item.user_query,
          botResponse: item.bot_response,
          contextSnapshot,
        });

        const inserted = await insertEvaluation(pool, {
          messageId: item.message_id,
          requestId: item.request_id,
          intent: item.intent,
          evaluatorModel: model,
          scores,
          inputHash,
          evidence: {
            candidateReason: item.reason,
            createdAt: item.created_at,
          },
        });

        evaluated.push({
          messageId: item.message_id,
          reason: item.reason,
          inserted,
          skippedByCache: false,
          error: null,
        });
      } catch (error: unknown) {
        evaluated.push({
          messageId: item.message_id,
          reason: item.reason,
          inserted: false,
          skippedByCache: false,
          error: error instanceof Error ? error.message : 'unknown_error',
        });
      }
    }

    const reportPath = await writeLocalReport('response-quality-eval-summary', {
      generatedAt: new Date().toISOString(),
      model,
      enabled,
      dailyCap,
      alreadyToday,
      availableBudget,
      selected: selected.length,
      inserted: evaluated.filter((row) => row.inserted).length,
      cacheHits: evaluated.filter((row) => row.skippedByCache).length,
      failed: evaluated.filter((row) => row.error !== null).length,
      evaluated,
    });

    // eslint-disable-next-line no-console
    console.log(reportPath);
  } finally {
    await pool.end();
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

async function evaluateWithJudge(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  prompt: string;
  userQuery: string;
  botResponse: string;
  contextSnapshot: string;
}): Promise<JudgeScores> {
  const response = await fetchWithTimeout(
    openaiResponsesUrl(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: input.prompt }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: buildJudgePayload({
                  userQuery: input.userQuery,
                  botResponse: input.botResponse,
                  contextSnapshot: input.contextSnapshot,
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
      }),
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`judge_http_${response.status}`);
  }

  const parsed = (await response.json()) as {
    output_text?: string | null;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  const raw =
    parsed.output_text ??
    parsed.output?.[0]?.content?.find((item) => typeof item.text === 'string')?.text;
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

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
