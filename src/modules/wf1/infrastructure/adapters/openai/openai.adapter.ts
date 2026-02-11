import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../../../../common/utils/logger';
import type { LlmPort } from '../../../application/ports/llm.port';
import type { ContextBlock } from '../../../domain/context-block';
import { withRetry } from '../openai-retry';
import { loadJsonFile, loadPromptFile } from '../shared';
import {
  ASSISTANT_PROMPT_PATH,
  ASSISTANT_SCHEMA_PATH,
  BASE_BACKOFF_MS,
  DEFAULT_ASSISTANT_SCHEMA,
  DEFAULT_SYSTEM_PROMPT,
  MAX_ATTEMPTS,
} from './constants';
import { OpenAiEmptyOutputError, OpenAiHttpError, OpenAiSchemaError } from './errors';
import { buildFallbackResponseWithPath } from './fallback-builder';
import { requestOpenAiLegacy, requestOpenAiStructured } from './openai-client';
import { isRetryableHttpStatus, isTimeoutOrNetwork } from './retry-helpers';
import type { OpenAiLegacyResult, OpenAiStructuredResult } from './types';

type FallbackReason =
  | 'missing_api_key'
  | 'timeout'
  | 'network'
  | 'http_429'
  | 'http_5xx'
  | 'http_other'
  | 'schema_invalid'
  | 'empty_output'
  | 'unknown';

@Injectable()
export class OpenAiAdapter implements LlmPort {
  private readonly logger = createLogger(OpenAiAdapter.name);
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly schema: Record<string, unknown>;
  private readonly structuredOutputEnabled: boolean;
  private readonly structuredOutputRolloutPercent: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 8000;
    this.systemPrompt = loadPromptFile(ASSISTANT_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT);
    this.schema = loadJsonFile(ASSISTANT_SCHEMA_PATH, DEFAULT_ASSISTANT_SCHEMA);
    this.structuredOutputEnabled = parseBoolean(
      this.configService.get<string | boolean>('WF1_FINAL_REPLY_STRUCTURED_OUTPUT'),
      false,
    );
    this.structuredOutputRolloutPercent = normalizeRolloutPercent(
      this.configService.get<number>('WF1_FINAL_REPLY_ROLLOUT_PERCENT'),
    );
  }

  async buildAssistantReply(input: {
    requestId: string;
    conversationId: string;
    externalEventId: string;
    userText: string;
    intent: Parameters<LlmPort['buildAssistantReply']>[0]['intent'];
    history: Array<{ sender: string; content: string; createdAt: string }>;
    contextBlocks: ContextBlock[];
  }): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4.1-mini';
    const useStructuredPath = this.shouldUseStructuredPath(input.requestId);
    const idempotencyKey = this.buildIdempotencyKey(input);

    if (!apiKey) {
      return this.buildAndLogFallback({
        reason: 'missing_api_key',
        intent: input.intent,
        contextBlocks: input.contextBlocks,
        requestId: input.requestId,
        model,
        attempts: 0,
      });
    }

    const startedAt = Date.now();
    let attempts = 0;

    try {
      const result = await withRetry({
        maxAttempts: MAX_ATTEMPTS,
        baseBackoffMs: BASE_BACKOFF_MS,
        fn: async () => {
          attempts += 1;

          if (useStructuredPath) {
            return await requestOpenAiStructured({
              apiKey,
              idempotencyKey,
              model,
              timeoutMs: this.timeoutMs,
              systemPrompt: this.systemPrompt,
              schema: this.schema,
              payload: {
                userText: input.userText,
                intent: input.intent,
                history: input.history,
                contextBlocks: input.contextBlocks,
              },
            });
          }

          return await requestOpenAiLegacy({
            apiKey,
            idempotencyKey,
            model,
            timeoutMs: this.timeoutMs,
            systemPrompt: this.systemPrompt,
            payload: {
              userText: input.userText,
              intent: input.intent,
              history: input.history,
              contextBlocks: input.contextBlocks,
            },
          });
        },
        shouldRetry: (err) => isRetryableHttpStatus(err) || isTimeoutOrNetwork(err),
        onAttemptFailed: (err, attempt, retrying) => {
          if (!retrying) {
            return;
          }

          this.logger.warn('openai_assistant_reply_attempt_failed', {
            event: 'openai_assistant_reply_attempt_failed',
            request_id: input.requestId,
            intent: input.intent,
            model,
            mode: useStructuredPath ? 'structured' : 'legacy',
            attempt,
            fallback_reason: this.resolveFallbackReason(err),
            retrying,
          });
        },
      });

      const message = resolveReplyMessage(result);
      this.logPromptDiagnostics(input.requestId, input.intent, model, result);

      this.logger.info('openai_assistant_reply_success', {
        event: 'openai_assistant_reply_success',
        request_id: input.requestId,
        intent: input.intent,
        model,
        latency_ms: Date.now() - startedAt,
        attempts,
        path: useStructuredPath ? 'structured_success' : null,
        schema_valid: isStructuredResult(result),
        usage_input_tokens: result.usage.inputTokens,
        usage_output_tokens: result.usage.outputTokens,
        usage_cached_tokens: result.usage.cachedTokens,
        mode: useStructuredPath ? 'structured' : 'legacy',
      });

      return message;
    } catch (error: unknown) {
      return this.buildAndLogFallback({
        reason: this.resolveFallbackReason(error),
        intent: input.intent,
        contextBlocks: input.contextBlocks,
        requestId: input.requestId,
        model,
        attempts,
        errorMessage: safeErrorMessage(error),
      });
    }
  }

  private buildAndLogFallback(input: {
    reason: FallbackReason;
    intent: string;
    contextBlocks: ContextBlock[];
    requestId: string;
    model: string;
    attempts: number;
    errorMessage?: string;
  }): string {
    const fallback = buildFallbackResponseWithPath(input.intent, input.contextBlocks);

    this.logger.warn('openai_assistant_reply_fallback', {
      event: 'openai_assistant_reply_fallback',
      request_id: input.requestId,
      intent: input.intent,
      model: input.model,
      path: fallback.path,
      schema_valid: false,
      fallback_reason: input.reason,
      attempts: input.attempts,
      schema_error: input.reason === 'schema_invalid' ? input.errorMessage ?? null : null,
    });

    return fallback.message;
  }

  private logPromptDiagnostics(
    requestId: string,
    intent: string,
    model: string,
    result: OpenAiLegacyResult | OpenAiStructuredResult,
  ): void {
    const diagnostics = result.promptDiagnostics;
    if (!diagnostics.contextTruncated) {
      return;
    }

    this.logger.warn('context_size_exceeded', {
      event: 'context_size_exceeded',
      request_id: requestId,
      intent,
      model,
      budget: diagnostics.contextBudget,
      context_chars_before: diagnostics.contextCharsBefore,
      context_chars_after: diagnostics.contextCharsAfter,
      ratio_over_budget:
        diagnostics.contextBudget > 0
          ? Number((diagnostics.contextCharsBefore / diagnostics.contextBudget).toFixed(3))
          : null,
      truncation_strategy: diagnostics.truncationStrategy,
      history_items_included: diagnostics.historyItemsIncluded,
    });
  }

  private resolveFallbackReason(error: unknown): FallbackReason {
    if (error instanceof OpenAiSchemaError) {
      return 'schema_invalid';
    }

    if (error instanceof OpenAiEmptyOutputError) {
      return 'empty_output';
    }

    if (error instanceof OpenAiHttpError) {
      if (error.status === 429) {
        return 'http_429';
      }
      if ([500, 502, 503, 504].includes(error.status)) {
        return 'http_5xx';
      }
      return 'http_other';
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'timeout';
      }
      if (error.message.includes('fetch')) {
        return 'network';
      }
    }

    return 'unknown';
  }

  private shouldUseStructuredPath(requestId: string): boolean {
    if (!this.structuredOutputEnabled) {
      return false;
    }

    if (this.structuredOutputRolloutPercent >= 100) {
      return true;
    }

    if (this.structuredOutputRolloutPercent <= 0) {
      return false;
    }

    const firstByte = createHash('sha256').update(requestId).digest()[0] ?? 0;
    const bucket = Math.floor((firstByte / 256) * 100);
    return bucket < this.structuredOutputRolloutPercent;
  }

  private buildIdempotencyKey(input: {
    requestId: string;
    conversationId: string;
    externalEventId: string;
  }): string {
    const conversationId = input.conversationId.trim();
    const externalEventId = input.externalEventId.trim();

    if (conversationId.length > 0 && externalEventId.length > 0) {
      return truncateIdempotencyKey(`wf1:${conversationId}:${externalEventId}:assistant-v1`);
    }

    return truncateIdempotencyKey(`wf1:${input.requestId}:assistant-v1`);
  }
}

function isStructuredResult(
  result: OpenAiLegacyResult | OpenAiStructuredResult,
): result is OpenAiStructuredResult {
  return 'payload' in result;
}

function parseBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function normalizeRolloutPercent(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function truncateIdempotencyKey(value: string): string {
  const MAX_LENGTH = 255;
  if (value.length <= MAX_LENGTH) {
    return value;
  }

  return value.slice(0, MAX_LENGTH);
}

function resolveReplyMessage(result: OpenAiLegacyResult | OpenAiStructuredResult): string {
  if (isStructuredResult(result)) {
    return result.payload.reply.trim();
  }

  return result.reply.trim();
}

function safeErrorMessage(error: unknown): string {
  const MAX_ERROR_CHARS = 200;
  if (!(error instanceof Error)) {
    return 'unknown_error';
  }

  if (error.message.length <= MAX_ERROR_CHARS) {
    return error.message;
  }

  return `${error.message.slice(0, MAX_ERROR_CHARS - 3)}...`;
}
