import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '../../../../common/utils/logger';
import type { LlmPort } from '../../application/ports/llm.port';
import type { ContextBlock } from '../../domain/context-block';
import { withRetry } from './openai-retry.client';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
const ASSISTANT_PROMPT_PATH = 'prompts/entelequia_assistant_system_prompt_v1.txt';
const DEFAULT_SYSTEM_PROMPT =
  'Sos el asistente de Entelequia. Responde en espanol rioplatense, claro y breve.';

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
}

@Injectable()
export class OpenAiAdapter implements LlmPort {
  private readonly logger = createLogger(OpenAiAdapter.name);
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 8000;
    this.systemPrompt = this.loadSystemPrompt();
  }

  private loadSystemPrompt(): string {
    const promptPath = resolve(process.cwd(), ASSISTANT_PROMPT_PATH);
    try {
      const value = readFileSync(promptPath, 'utf8').trim();
      return value.length > 0 ? value : DEFAULT_SYSTEM_PROMPT;
    } catch (error: unknown) {
      this.logger.warn('Failed to load assistant prompt', {
        path: promptPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return DEFAULT_SYSTEM_PROMPT;
    }
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
        fn: () => this.requestOpenAi(apiKey, model, input),
        shouldRetry: (err) =>
          isRetryableHttpStatus(err) || isTimeoutOrNetwork(err),
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

  private async requestOpenAi(
    apiKey: string,
    model: string,
    input: {
      userText: string;
      intent: string;
      history: Array<{ sender: string; content: string; createdAt: string }>;
      contextBlocks: ContextBlock[];
    },
  ): Promise<string> {
    const prompt = buildPrompt(
      this.systemPrompt,
      input.userText,
      input.intent,
      input.history,
      input.contextBlocks,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: prompt,
          temperature: 0.2,
          max_output_tokens: 220,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new OpenAiHttpError(response.status);
      }

      const parsed = (await response.json()) as OpenAiResponse;

      const text =
        parsed.output_text ??
        parsed.output?.[0]?.content?.find((c) => typeof c.text === 'string')?.text;

      if (!text || text.trim().length === 0) {
        throw new Error('OpenAI response missing text');
      }

      return text.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

class OpenAiHttpError extends Error {
  constructor(public readonly status: number) {
    super(`OpenAI HTTP ${status}`);
    this.name = 'OpenAiHttpError';
  }
}

function isRetryableHttpStatus(err: unknown): boolean {
  if (err instanceof OpenAiHttpError) {
    return [429, 500, 502, 503, 504].includes(err.status);
  }
  return false;
}

function isTimeoutOrNetwork(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message?.includes('fetch'));
}

function buildPrompt(
  systemPrompt: string,
  userText: string,
  intent: string,
  history: Array<{ sender: string; content: string; createdAt: string }>,
  contextBlocks: ContextBlock[],
): string {
  return [
    systemPrompt,
    `Intent detectado: ${intent}`,
    `Mensaje usuario: ${userText}`,
    `Historial reciente: ${JSON.stringify(history.slice(-6))}`,
    `Contexto negocio: ${JSON.stringify(contextBlocks)}`,
  ].join('\n');
}

function buildFallbackResponse(intent: string, contextBlocks: ContextBlock[]): string {
  if (intent === 'orders') {
    return 'Puedo ayudarte con el estado de tu pedido. Si queres, compartime el numero de pedido.';
  }

  if (intent === 'payment_shipping') {
    return 'Te comparto los medios de pago y promociones vigentes segun la informacion disponible.';
  }

  if (intent === 'tickets') {
    return 'Siento el inconveniente. Contame el problema y te ayudo a escalarlo con soporte.';
  }

  if (intent === 'recommendations') {
    return 'Te recomiendo estos productos destacados en este momento.';
  }

  const productsBlock = contextBlocks.find((block) => block.contextType === 'products');
  if (productsBlock) {
    return 'Encontre resultados relacionados. Si queres, te detallo los mas relevantes.';
  }

  return 'Perfecto, te ayudo con eso. Contame un poco mas para darte una respuesta precisa.';
}
