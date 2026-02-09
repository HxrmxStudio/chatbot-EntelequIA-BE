import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmPort } from '../../application/ports/llm.port';
import type { ContextBlock } from '../../domain/context-block';

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
  private readonly logger = new Logger(OpenAiAdapter.name);
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('OPENAI_TIMEOUT_MS') ?? 8000;
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

    const prompt = buildPrompt(input.userText, input.intent, input.history, input.contextBlocks);
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
        this.logger.error(`OpenAI error status ${response.status}`);
        return buildFallbackResponse(input.intent, input.contextBlocks);
      }

      const parsed = (await response.json()) as OpenAiResponse;

      const text =
        parsed.output_text ??
        parsed.output?.[0]?.content?.find((content) => typeof content.text === 'string')?.text;

      if (!text || text.trim().length === 0) {
        return buildFallbackResponse(input.intent, input.contextBlocks);
      }

      return text.trim();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn(`OpenAI request timeout after ${this.timeoutMs}ms`);
        return buildFallbackResponse(input.intent, input.contextBlocks);
      }

      this.logger.error('OpenAI request failed', error instanceof Error ? error.stack : undefined);
      return buildFallbackResponse(input.intent, input.contextBlocks);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function buildPrompt(
  userText: string,
  intent: string,
  history: Array<{ sender: string; content: string; createdAt: string }>,
  contextBlocks: ContextBlock[],
): string {
  return [
    'Sos el asistente de Entelequia. Responde en espanol rioplatense, claro y breve.',
    'No inventes datos fuera del contexto provisto.',
    'Si faltan datos, pedilos en una sola pregunta corta.',
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
