import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../../../../common/utils/logger';
import type { IntentExtractorPort } from '../../../application/ports/intent-extractor.port';
import {
  FALLBACK_INTENT_RESULT,
  type IntentResult,
} from '../../../domain/intent';
import { validateAndNormalizeIntentPayload } from '../intent-validator';
import { withRetry } from '../openai-retry';
import { loadJsonFile, loadPromptFile } from '../shared';
import { BASE_BACKOFF_MS, DEFAULT_SCHEMA, DEFAULT_SYSTEM_PROMPT, INTENT_PROMPT_PATH, INTENT_SCHEMA_PATH, MAX_ATTEMPTS } from './constants';
import { classifyFailure, resolveModelPayload, shouldRetry } from './response-helpers';
import { hashText, normalizeText, truncateText } from './text-helpers';
import { requestIntent } from './openai-client';

@Injectable()
export class IntentExtractorAdapter implements IntentExtractorPort {
  private readonly logger = createLogger(IntentExtractorAdapter.name);
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly schema: Record<string, unknown>;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 12_000;
    this.systemPrompt = loadPromptFile(INTENT_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT);
    this.schema = loadJsonFile(INTENT_SCHEMA_PATH, DEFAULT_SCHEMA);
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
    const { text, truncated } = truncateText(normalizedText, 4000);

    if (!apiKey) {
      this.logger.warn('intent_classification_fallback', {
        event: 'intent_classification_fallback',
        request_id: input.requestId,
        source: input.source,
        user_id: input.userId,
        conversation_id: input.conversationId,
        model: 'gpt-4o-mini',
        prompt_version: 'v1',
        attempts: 0,
        fallback: true,
        fallback_reason: 'missing_openai_api_key',
      });
      return { ...FALLBACK_INTENT_RESULT };
    }

    const textHash = hashText(text);

    try {
      const attemptStartedAt = Date.now();
      const { intent, usage } = await withRetry({
        maxAttempts: MAX_ATTEMPTS,
        baseBackoffMs: BASE_BACKOFF_MS,
        fn: async () => {
          const response = await requestIntent({
            apiKey,
            text,
            timeoutMs: this.timeoutMs,
            systemPrompt: this.systemPrompt,
            schema: this.schema,
          });
          const modelPayload = resolveModelPayload(response);
          const intentResult = validateAndNormalizeIntentPayload(modelPayload);
          return { intent: intentResult, usage: response.usage ?? null };
        },
        shouldRetry,
        onAttemptFailed: (error, attempt, retrying) => {
          this.logger.warn('intent_classification_attempt_failed', {
            event: 'intent_classification_attempt_failed',
            request_id: input.requestId,
            source: input.source,
            user_id: input.userId,
            conversation_id: input.conversationId,
            model: 'gpt-4o-mini',
            prompt_version: 'v1',
            attempts: attempt,
            fallback_reason: classifyFailure(error),
            retrying,
            text_hash: textHash,
            text_len: text.length,
            truncated,
          });
        },
      });

      this.logger.info('intent_classification_success', {
        event: 'intent_classification_success',
        request_id: input.requestId,
        source: input.source,
        user_id: input.userId,
        conversation_id: input.conversationId,
        model: 'gpt-4o-mini',
        prompt_version: 'v1',
        latency_ms: Date.now() - attemptStartedAt,
        text_hash: textHash,
        text_len: text.length,
        truncated,
        fallback: false,
        token_usage: usage,
        intent: intent.intent,
        confidence: intent.confidence,
        entities_count: intent.entities.length,
      });

      return intent;
    } catch {
      this.logger.warn('intent_classification_fallback', {
        event: 'intent_classification_fallback',
        request_id: input.requestId,
        source: input.source,
        user_id: input.userId,
        conversation_id: input.conversationId,
        model: 'gpt-4o-mini',
        prompt_version: 'v1',
        attempts: MAX_ATTEMPTS,
        fallback: true,
        fallback_reason: 'max_attempts_exceeded',
      });

      return { ...FALLBACK_INTENT_RESULT };
    }
  }
}
