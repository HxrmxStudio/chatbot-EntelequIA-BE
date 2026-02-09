import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IntentExtractorPort } from '../../application/ports/intent-extractor.port';
import {
  FALLBACK_INTENT_RESULT,
  INTENT_NAMES,
  type IntentResult,
} from '../../domain/intent';
import {
  IntentValidationError,
  validateAndNormalizeIntentPayload,
} from './intent.validator';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const INTENT_MODEL = 'gpt-4o-mini';
const PROMPT_VERSION = 'v1';
const SCHEMA_NAME = 'entelequia_intent_classification';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
const MAX_INPUT_CHARS = 4000;

interface OpenAiResponse {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      json?: unknown;
    }>;
  }>;
}

class IntentExtractorHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Intent extractor OpenAI HTTP ${statusCode}`);
    this.name = 'IntentExtractorHttpError';
  }
}

class IntentExtractorNetworkError extends Error {
  constructor(public readonly code: 'timeout' | 'network') {
    super(`Intent extractor OpenAI ${code}`);
    this.name = 'IntentExtractorNetworkError';
  }
}

@Injectable()
export class IntentExtractorAdapter implements IntentExtractorPort {
  private readonly logger = new Logger(IntentExtractorAdapter.name);
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly schema: Record<string, unknown>;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 12_000;
    this.systemPrompt = this.loadSystemPrompt();
    this.schema = this.loadSchema();
  }

  async extractIntent(input: {
    text: string;
    requestId?: string;
    source?: string;
    userId?: string;
    conversationId?: string;
  }): Promise<IntentResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const normalizedText = normalizeText(input.text);
    const { text, truncated } = truncateText(normalizedText, MAX_INPUT_CHARS);

    if (!apiKey) {
      this.logger.warn(
        JSON.stringify({
          event: 'intent_classification_fallback',
          request_id: input.requestId,
          source: input.source,
          user_id: input.userId,
          conversation_id: input.conversationId,
          model: INTENT_MODEL,
          prompt_version: PROMPT_VERSION,
          attempts: 0,
          fallback: true,
          fallback_reason: 'missing_openai_api_key',
        }),
      );
      return { ...FALLBACK_INTENT_RESULT };
    }

    const textHash = hashText(text);
    let attempts = 0;
    let fallbackReason = 'unknown_error';

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      const attemptStartedAt = Date.now();

      try {
        const response = await this.requestIntent({
          apiKey,
          text,
        });
        const modelPayload = resolveModelPayload(response);
        const intent = validateAndNormalizeIntentPayload(modelPayload);

        this.logger.log(
          JSON.stringify({
            event: 'intent_classification_success',
            request_id: input.requestId,
            source: input.source,
            user_id: input.userId,
            conversation_id: input.conversationId,
            model: INTENT_MODEL,
            prompt_version: PROMPT_VERSION,
            attempts,
            latency_ms: Date.now() - attemptStartedAt,
            text_hash: textHash,
            text_len: text.length,
            truncated,
            fallback: false,
            token_usage: response.usage ?? null,
            intent: intent.intent,
            confidence: intent.confidence,
            entities_count: intent.entities.length,
          }),
        );

        return intent;
      } catch (error: unknown) {
        fallbackReason = classifyFailure(error);
        const canRetry = shouldRetry(error) && attempts < MAX_ATTEMPTS;

        this.logger.warn(
          JSON.stringify({
            event: 'intent_classification_attempt_failed',
            request_id: input.requestId,
            source: input.source,
            user_id: input.userId,
            conversation_id: input.conversationId,
            model: INTENT_MODEL,
            prompt_version: PROMPT_VERSION,
            attempts,
            fallback_reason: fallbackReason,
            retrying: canRetry,
            text_hash: textHash,
            text_len: text.length,
            truncated,
          }),
        );

        if (!canRetry) {
          break;
        }

        await sleep(computeBackoffDelayMs(attempts));
      }
    }

    this.logger.warn(
      JSON.stringify({
        event: 'intent_classification_fallback',
        request_id: input.requestId,
        source: input.source,
        user_id: input.userId,
        conversation_id: input.conversationId,
        model: INTENT_MODEL,
        prompt_version: PROMPT_VERSION,
        attempts,
        fallback: true,
        fallback_reason: fallbackReason,
      }),
    );

    return { ...FALLBACK_INTENT_RESULT };
  }

  private async requestIntent(input: { apiKey: string; text: string }): Promise<OpenAiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: INTENT_MODEL,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: this.systemPrompt }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: input.text }],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: SCHEMA_NAME,
              schema: this.schema,
              strict: false,
            },
          },
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new IntentExtractorHttpError(response.status, responseText);
      }

      try {
        return JSON.parse(responseText) as OpenAiResponse;
      } catch {
        throw new IntentValidationError('OpenAI response is not valid JSON');
      }
    } catch (error: unknown) {
      if (error instanceof IntentExtractorHttpError || error instanceof IntentValidationError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new IntentExtractorNetworkError('timeout');
      }

      throw new IntentExtractorNetworkError('network');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private loadSystemPrompt(): string {
    const promptPath = resolve(process.cwd(), 'prompts/entelequia_intent_system_prompt_v1.txt');

    try {
      const value = readFileSync(promptPath, 'utf8').trim();
      if (value.length === 0) {
        throw new Error('prompt file is empty');
      }

      return value;
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to load intent prompt from ${promptPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return DEFAULT_SYSTEM_PROMPT;
    }
  }

  private loadSchema(): Record<string, unknown> {
    const schemaPath = resolve(process.cwd(), 'schemas/entelequia_intent_classification.schema.json');

    try {
      const parsed = JSON.parse(readFileSync(schemaPath, 'utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('schema file must be a JSON object');
      }

      return parsed as Record<string, unknown>;
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to load intent schema from ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return DEFAULT_SCHEMA;
    }
  }
}

function normalizeText(text: string): string {
  return typeof text === 'string' ? text.trim() : '';
}

function truncateText(
  text: string,
  maxChars: number,
): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true,
  };
}

function resolveModelPayload(response: OpenAiResponse): unknown {
  if (response.output_text && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  for (const outputItem of response.output ?? []) {
    for (const content of outputItem.content ?? []) {
      if (content && typeof content === 'object') {
        if (content.json !== undefined) {
          return content.json;
        }

        if (typeof content.text === 'string' && content.text.trim().length > 0) {
          return content.text;
        }
      }
    }
  }

  throw new IntentValidationError('OpenAI response did not contain output payload');
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof IntentValidationError) {
    return true;
  }

  if (error instanceof IntentExtractorNetworkError) {
    return true;
  }

  if (error instanceof IntentExtractorHttpError) {
    return [429, 500, 502, 503, 504].includes(error.statusCode);
  }

  return true;
}

function classifyFailure(error: unknown): string {
  if (error instanceof IntentValidationError) {
    return error.message;
  }

  if (error instanceof IntentExtractorNetworkError) {
    return error.code;
  }

  if (error instanceof IntentExtractorHttpError) {
    return `http_${error.statusCode}`;
  }

  return 'unknown_error';
}

function computeBackoffDelayMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.max(0, Math.round(base + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const DEFAULT_SYSTEM_PROMPT = [
  'Eres un clasificador de intenciones para Entelequia.',
  'Debes responder solo JSON con intent, confidence y entities.',
  `Intent permitidos: ${INTENT_NAMES.join(', ')}`,
  'Si hay ambiguedad, usa general con confidence menor a 0.7.',
].join('\n');

const DEFAULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: INTENT_NAMES,
    },
    confidence: {
      type: 'number',
    },
    entities: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['intent', 'confidence', 'entities'],
  additionalProperties: false,
};
