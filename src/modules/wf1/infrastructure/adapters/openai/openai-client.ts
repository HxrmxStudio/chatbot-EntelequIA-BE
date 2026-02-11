import type { ContextBlock } from '../../../domain/context-block';
import { fetchWithTimeout } from '../shared';
import {
  ASSISTANT_MAX_OUTPUT_TOKENS,
  ASSISTANT_SCHEMA_NAME,
  ASSISTANT_SCHEMA_VERSION,
  ASSISTANT_TEMPERATURE,
} from './constants';
import { OpenAiEmptyOutputError, OpenAiHttpError, OpenAiSchemaError } from './errors';
import { openaiResponsesUrl } from './endpoints';
import { buildPrompt } from './prompt-builder';
import type {
  AssistantReplyPayload,
  OpenAiLegacyResult,
  OpenAiResponse,
  OpenAiStructuredResult,
  OpenAiUsageMetrics,
  OpenAiUsageRaw,
} from './types';

type OpenAiInput = {
  userText: string;
  intent: string;
  history: Array<{ sender: string; content: string; createdAt: string }>;
  contextBlocks: ContextBlock[];
};

export async function requestOpenAiLegacy(input: {
  apiKey: string;
  idempotencyKey: string;
  model: string;
  timeoutMs: number;
  systemPrompt: string;
  payload: OpenAiInput;
}): Promise<OpenAiLegacyResult> {
  const promptResult = buildPrompt(
    input.payload.userText,
    input.payload.intent,
    input.payload.history,
    input.payload.contextBlocks,
  );

  const response = await fetchWithTimeout(
    openaiResponsesUrl(),
    {
      method: 'POST',
      headers: buildHeaders(input.apiKey, input.idempotencyKey),
      body: JSON.stringify({
        model: input.model,
        input: `${input.systemPrompt}\n\n${promptResult.userPrompt}`,
        temperature: ASSISTANT_TEMPERATURE,
        max_output_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
      }),
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new OpenAiHttpError(response.status);
  }

  const parsed = (await response.json()) as OpenAiResponse;
  const text = extractResponseText(parsed);

  return {
    reply: text,
    usage: extractUsageMetrics(parsed.usage),
    promptDiagnostics: promptResult.diagnostics,
  };
}

export async function requestOpenAiStructured(input: {
  apiKey: string;
  idempotencyKey: string;
  model: string;
  timeoutMs: number;
  systemPrompt: string;
  schema: Record<string, unknown>;
  payload: OpenAiInput;
}): Promise<OpenAiStructuredResult> {
  const promptResult = buildPrompt(
    input.payload.userText,
    input.payload.intent,
    input.payload.history,
    input.payload.contextBlocks,
  );

  const response = await fetchWithTimeout(
    openaiResponsesUrl(),
    {
      method: 'POST',
      headers: buildHeaders(input.apiKey, input.idempotencyKey),
      body: JSON.stringify({
        model: input.model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: input.systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: promptResult.userPrompt }],
          },
        ],
        temperature: ASSISTANT_TEMPERATURE,
        max_output_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
        text: {
          format: {
            type: 'json_schema',
            name: ASSISTANT_SCHEMA_NAME,
            schema: input.schema,
            strict: true,
          },
        },
      }),
    },
    input.timeoutMs,
  );

  if (!response.ok) {
    throw new OpenAiHttpError(response.status);
  }

  const parsed = (await response.json()) as OpenAiResponse;
  const rawText = extractResponseText(parsed);
  const payload = parseStructuredReply(rawText);

  return {
    payload,
    usage: extractUsageMetrics(parsed.usage),
    promptDiagnostics: promptResult.diagnostics,
  };
}

function buildHeaders(apiKey: string, idempotencyKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'Idempotency-Key': idempotencyKey,
  };
}

function extractResponseText(parsed: OpenAiResponse): string {
  const text =
    parsed.output_text ??
    parsed.output?.[0]?.content?.find((content) => typeof content.text === 'string')?.text;

  if (!text || text.trim().length === 0) {
    throw new OpenAiEmptyOutputError();
  }

  return text.trim();
}

function parseStructuredReply(rawText: string): AssistantReplyPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new OpenAiSchemaError('Structured output is not valid JSON');
  }

  if (!isAssistantReplyPayload(parsed)) {
    throw new OpenAiSchemaError('Structured output does not match assistant schema');
  }

  return parsed;
}

function isAssistantReplyPayload(value: unknown): value is AssistantReplyPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate['reply'] !== 'string' ||
    candidate['reply'].trim().length === 0 ||
    candidate['reply'].length > 1200
  ) {
    return false;
  }

  if (typeof candidate['requires_clarification'] !== 'boolean') {
    return false;
  }

  const clarifyingQuestion = candidate['clarifying_question'];
  if (
    clarifyingQuestion !== null &&
    (typeof clarifyingQuestion !== 'string' || clarifyingQuestion.length > 300)
  ) {
    return false;
  }

  const confidenceLabel = candidate['confidence_label'];
  if (
    confidenceLabel !== 'high' &&
    confidenceLabel !== 'medium' &&
    confidenceLabel !== 'low'
  ) {
    return false;
  }

  return candidate['_schema_version'] === ASSISTANT_SCHEMA_VERSION;
}

function extractUsageMetrics(rawUsage: OpenAiUsageRaw | null | undefined): OpenAiUsageMetrics {
  const inputTokens = asNullableNumber(rawUsage?.input_tokens);
  const outputTokens = asNullableNumber(rawUsage?.output_tokens);
  const cachedTokens = asNullableNumber(
    rawUsage?.input_tokens_details?.cached_tokens ??
      rawUsage?.prompt_tokens_details?.cached_tokens,
  );

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
  };
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
