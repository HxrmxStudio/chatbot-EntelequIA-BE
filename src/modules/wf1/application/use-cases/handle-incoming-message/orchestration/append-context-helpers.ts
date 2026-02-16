import {
  appendCriticalPolicyContextBlock,
  appendPolicyFactsContextBlock,
  appendStaticContextBlock,
  type ContextBlock,
} from '@/modules/wf1/domain/context-block';
import type { IntentName } from '@/modules/wf1/domain/intent';
import type { AdaptiveExemplarsPort } from '@/modules/wf1/application/ports/adaptive-exemplars.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import { shouldCountReturnsPolicyAnswer } from '../support/handle-incoming-message.helpers';
import type { ResolveResponseInput } from './resolve-response';

export function appendPolicyContext(
  contextBlocks: ContextBlock[],
  input: ResolveResponseInput,
  intent: string,
): ContextBlock[] {
  let nextBlocks = appendStaticContextBlock(contextBlocks, input.promptTemplates.getStaticContext());
  nextBlocks = appendPolicyFactsContextBlock(
    nextBlocks,
    input.promptTemplates.getPolicyFactsShortContext(),
  );
  nextBlocks = appendCriticalPolicyContextBlock(
    nextBlocks,
    input.promptTemplates.getCriticalPolicyContext(),
  );

  input.metricsPort.incrementCriticalPolicyContextInjected({
    intent,
  });
  input.logger.chat('critical_policy_context_injected', {
    event: 'critical_policy_context_injected',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    intent,
  });

  if (shouldCountReturnsPolicyAnswer(nextBlocks, intent)) {
    input.metricsPort.incrementReturnsPolicyDirectAnswer();
    input.logger.chat('returns_policy_answered_from_context', {
      event: 'returns_policy_answered_from_context',
      request_id: input.requestId,
      conversation_id: input.payload.conversationId,
      intent,
    });
  }

  return nextBlocks;
}

export async function appendAdaptiveExemplarContext(input: {
  contextBlocks: ContextBlock[];
  intent: IntentName;
  recursiveLearningEnabled: boolean;
  adaptiveExemplars: AdaptiveExemplarsPort;
  metricsPort: MetricsPort;
}): Promise<ContextBlock[]> {
  const contextBlocks = input.contextBlocks;
  if (!input.recursiveLearningEnabled) {
    return contextBlocks;
  }

  const exemplars = await input.adaptiveExemplars.getActiveExemplarsByIntent({
    intent: input.intent,
    limit: 2,
  });

  if (exemplars.length === 0) {
    return contextBlocks;
  }

  for (const exemplar of exemplars) {
    input.metricsPort.incrementExemplarsUsedInPrompt({
      intent: input.intent,
      source: exemplar.source,
    });
  }

  const hints = exemplars
    .map((exemplar, index) => `${index + 1}. ${exemplar.promptHint}`)
    .join('\n');

  return [
    ...contextBlocks,
    {
      contextType: 'general',
      contextPayload: {
        hint: `Guia de calidad validada para ${input.intent}:\n${hints}`,
      },
    },
  ];
}
