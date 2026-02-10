import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../../../../common/utils/logger';
import type { LlmPort } from '../../../application/ports/llm.port';
import type { ContextBlock } from '../../../domain/context-block';
import { withRetry } from '../openai-retry';
import { loadPromptFile } from '../shared';
import { ASSISTANT_PROMPT_PATH, BASE_BACKOFF_MS, DEFAULT_SYSTEM_PROMPT, MAX_ATTEMPTS } from './constants';
import { buildFallbackResponse } from './fallback-builder';
import { requestOpenAi } from './openai-client';
import { isRetryableHttpStatus, isTimeoutOrNetwork } from './retry-helpers';

@Injectable()
export class OpenAiAdapter implements LlmPort {
  private readonly logger = createLogger(OpenAiAdapter.name);
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 8000;
    this.systemPrompt = loadPromptFile(ASSISTANT_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT);
  }

  async buildAssistantReply(input: {
    userText: string;
    intent: string;
    history: Array<{ sender: string; content: string; createdAt: string }>;
    contextBlocks: ContextBlock[];
  }): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4.1-mini';

    if (!apiKey) {
      return buildFallbackResponse(input.intent, input.contextBlocks);
    }

    try {
      return await withRetry({
        maxAttempts: MAX_ATTEMPTS,
        baseBackoffMs: BASE_BACKOFF_MS,
        fn: () => requestOpenAi(apiKey, model, this.timeoutMs, this.systemPrompt, input),
        shouldRetry: (err) => isRetryableHttpStatus(err) || isTimeoutOrNetwork(err),
        onAttemptFailed: (err, attempt, retrying) => {
          if (retrying) {
            this.logger.warn('OpenAI attempt failed, retrying', {
              attempt,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        'OpenAI request failed after retries',
        error instanceof Error ? error : undefined,
      );
      return buildFallbackResponse(input.intent, input.contextBlocks);
    }
  }
}
