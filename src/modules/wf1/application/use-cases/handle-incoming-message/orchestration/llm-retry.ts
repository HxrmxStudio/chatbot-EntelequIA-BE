import type { IntentName } from '@/modules/wf1/domain/intent';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import type { LlmReplyMetadata } from '@/modules/wf1/application/ports/llm.port';
import { normalizeLlmReply } from '../support/handle-incoming-message.helpers';
import type { MutableResolutionState, ResolveResponseInput } from './resolve-response';

export async function buildAssistantReplyWithGuidedRetry(
  input: ResolveResponseInput,
  state: MutableResolutionState,
  contextBlocks: ContextBlock[],
): Promise<{ message: string; metadata?: LlmReplyMetadata }> {
  const firstReply = await input.llmPort.buildAssistantReply({
    requestId: input.requestId,
    conversationId: input.payload.conversationId,
    externalEventId: input.externalEventId,
    userText: state.effectiveText,
    intent: state.effectiveRoutedIntent as IntentName,
    history: input.history,
    contextBlocks,
  });
  state.llmAttempts += 1;

  const firstNormalized = normalizeLlmReply(firstReply);
  if (!shouldRetryLlmWithGuidance(firstNormalized.message, firstNormalized.metadata)) {
    return firstNormalized;
  }

  const guidedContextBlocks = [
    ...contextBlocks,
    {
      contextType: 'general' as const,
      contextPayload: {
        hint:
          'Reintento guiado: evita respuesta generica. Responde accionable y especifico al pedido actual, sin reiniciar el flujo.',
      },
    },
  ];

  const retryReply = await input.llmPort.buildAssistantReply({
    requestId: input.requestId,
    conversationId: input.payload.conversationId,
    externalEventId: input.externalEventId,
    userText: state.effectiveText,
    intent: state.effectiveRoutedIntent as IntentName,
    history: input.history,
    contextBlocks: guidedContextBlocks,
  });
  state.llmAttempts += 1;
  state.pipelineFallbackCount += 1;
  state.pipelineFallbackReasons.push('llm_guided_retry');

  return normalizeLlmReply(retryReply);
}

/**
 * Determines if LLM response needs a guided retry based on metadata flags.
 * Uses metadata only - no message parsing.
 */
function shouldRetryLlmWithGuidance(
  message: string,
  metadata?: LlmReplyMetadata,
): boolean {
  if (typeof metadata?.llmPath === 'string' && metadata.llmPath.startsWith('fallback_')) {
    return true;
  }

  if (typeof metadata?.fallbackReason === 'string' && metadata.fallbackReason.length > 0) {
    return true;
  }

  const normalizedMessage = message.trim();
  if (normalizedMessage.length === 0) {
    return true;
  }

  return false;
}
