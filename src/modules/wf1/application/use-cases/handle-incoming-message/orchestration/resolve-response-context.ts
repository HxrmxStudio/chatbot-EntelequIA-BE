import type { IntentName } from '@/modules/wf1/domain/intent';
import { buildCatalogSnapshot, buildCatalogUiPayload } from '@/modules/wf1/domain/ui-payload';
import {
  appendPriceChallengeHintContextBlock,
  type ContextBlock,
} from '@/modules/wf1/domain/context-block';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import {
  buildRecommendationsDisambiguationResponseFromContext,
  type RecommendationsContextDisambiguationResult,
} from '../flows/recommendations/recommendations-context-disambiguation.flow';
import { recordRecommendationsObservability } from '../flows/recommendations/recommendations-observability';
import { resolveRecommendationsMemoryUpdateFromContext } from '../flows/recommendations/recommendations-memory';
import { detectPriceChallenge } from '../flows/pricing/resolve-price-challenge';
import { mapContextOrBackendError } from '../support/error-mapper';
import {
  hasCatalogUiContext,
  resolveExactStockDisclosure,
} from '../support/handle-incoming-message.helpers';
import { appendPolicyContext, appendAdaptiveExemplarContext } from './append-context-helpers';
import { buildAssistantReplyWithGuidedRetry } from './llm-retry';
import { checkIfAuthenticated } from '../support/check-if-authenticated';
import type { MutableResolutionState, ResolveResponseInput } from './resolve-response';

const ORDERS_MIN_CONTEXT_MAX_CHARS = 1600;

export async function resolveContextFallback(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): Promise<void> {
  try {
    state.toolAttempts += 1;
    state.contextBlocks = await input.enrichContextByIntent.execute({
      intentResult: state.effectiveRoutedIntentResult,
      text: state.effectiveText,
      sentiment: input.validatedIntent.sentiment,
      currency: input.payload.currency,
      accessToken: input.payload.accessToken,
      requestId: input.requestId,
      conversationId: input.payload.conversationId,
    });
    persistRecommendationsMemoryFromContext(state);

    const disambiguationResponse = buildRecommendationsDisambiguationResponseFromContext({
      contextBlocks: state.contextBlocks,
    });

    if (disambiguationResponse) {
      applyRecommendationsDisambiguation(state, disambiguationResponse, input.metricsPort);
      return;
    }

    if (!state.contextBlocks) {
      return;
    }

    recordRecommendationsObservability({
      requestId: input.requestId,
      conversationId: input.payload.conversationId,
      intent: state.effectiveRoutedIntent,
      contextBlocks: state.contextBlocks,
      logger: input.logger,
      metricsPort: input.metricsPort,
    });

    if (
      shouldUseOrdersMinimalContext({
        intent: state.effectiveRoutedIntent,
        accessToken: input.payload.accessToken,
      })
    ) {
      state.contextBlocks = buildOrdersMinimalContext(state.contextBlocks);
    } else {
      state.contextBlocks = appendPolicyContext(state.contextBlocks, input, state.effectiveRoutedIntent);
    }
    state.contextBlocks = await appendAdaptiveExemplarContext({
      contextBlocks: state.contextBlocks,
      intent: state.effectiveRoutedIntent as IntentName,
      recursiveLearningEnabled: input.recursiveLearningEnabled,
      adaptiveExemplars: input.adaptiveExemplars,
      metricsPort: input.metricsPort,
    });

    const challengeResolution = detectPriceChallenge({
      text: input.sanitizedText,
      memory: state.currentRecommendationsMemory,
      lastBotMessage: input.latestBotMessage,
    });
    if (challengeResolution.isChallenge && challengeResolution.shouldRevalidate) {
      state.contextBlocks = appendPriceChallengeHintContextBlock(state.contextBlocks);
    }

    const llmResult = await buildAssistantReplyWithGuidedRetry(input, state, state.contextBlocks);
    const { message, metadata } = llmResult;
    state.llmMetadata = metadata;
    if (metadata?.criticalPolicyTrimmed) {
      input.metricsPort.incrementCriticalPolicyContextTrimmed({
        intent: state.effectiveRoutedIntent as IntentName,
      });
      input.logger.warn('critical_policy_context_trimmed', {
        event: 'critical_policy_context_trimmed',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        intent: state.effectiveRoutedIntent,
      });
    }

    state.exactStockDisclosed = resolveExactStockDisclosure(state.contextBlocks);
    state.uiPayload = buildCatalogUiPayload(state.contextBlocks);
    state.catalogSnapshot = buildCatalogSnapshot(state.contextBlocks);
    const hasCatalogContext = hasCatalogUiContext(state.contextBlocks);
    if (state.uiPayload) {
      input.metricsPort.incrementUiPayloadEmitted();
    } else if (hasCatalogContext) {
      input.metricsPort.incrementUiPayloadSuppressed('no_cards');
    }

    state.response = {
      ok: true,
      message,
      conversationId: input.payload.conversationId,
      intent: state.effectiveRoutedIntent as IntentName,
      ...(state.uiPayload ? { ui: state.uiPayload } : {}),
    };
  } catch (error: unknown) {
    state.response = mapContextOrBackendError(error);
  }
}

function persistRecommendationsMemoryFromContext(state: MutableResolutionState): void {
  if (!state.contextBlocks) {
    return;
  }

  const recommendationsMemoryUpdate = resolveRecommendationsMemoryUpdateFromContext({
    contextBlocks: state.contextBlocks,
    text: state.effectiveText,
    entities: state.effectiveRoutedIntentResult.entities,
  });
  if (recommendationsMemoryUpdate.lastFranchise !== undefined) {
    state.recommendationsLastFranchiseToPersist = recommendationsMemoryUpdate.lastFranchise;
  }
  if (recommendationsMemoryUpdate.lastType !== undefined) {
    state.recommendationsLastTypeToPersist = recommendationsMemoryUpdate.lastType;
  }
  if (recommendationsMemoryUpdate.snapshotTimestamp !== undefined) {
    state.recommendationsSnapshotTimestampToPersist = recommendationsMemoryUpdate.snapshotTimestamp;
  }
  if (recommendationsMemoryUpdate.snapshotSource !== undefined) {
    state.recommendationsSnapshotSourceToPersist = recommendationsMemoryUpdate.snapshotSource;
  }
  if (recommendationsMemoryUpdate.snapshotItemCount !== undefined) {
    state.recommendationsSnapshotItemCountToPersist = recommendationsMemoryUpdate.snapshotItemCount;
  }
}

function applyRecommendationsDisambiguation(
  state: MutableResolutionState,
  disambiguationResponse: RecommendationsContextDisambiguationResult,
  metricsPort: MetricsPort,
): void {
  state.response = disambiguationResponse.response;
  state.recommendationsFlowStateToPersist = disambiguationResponse.nextState;
  state.recommendationsFlowFranchiseToPersist = disambiguationResponse.nextFranchise;
  state.recommendationsFlowCategoryHintToPersist = disambiguationResponse.nextCategoryHint;
  metricsPort.incrementRecommendationsDisambiguationTriggered();
}

function shouldUseOrdersMinimalContext(input: {
  intent: string;
  accessToken?: string;
}): boolean {
  return input.intent === 'orders' && checkIfAuthenticated(input.accessToken);
}

function buildOrdersMinimalContext(contextBlocks: ContextBlock[]): ContextBlock[] {
  const ordersBlocks = contextBlocks.filter(
    (block) => block.contextType === 'orders' || block.contextType === 'order_detail',
  );
  if (ordersBlocks.length === 0) {
    return contextBlocks;
  }

  const perBlockBudget = Math.max(1, Math.floor(ORDERS_MIN_CONTEXT_MAX_CHARS / ordersBlocks.length));
  return ordersBlocks.map((block) => {
    const aiContext = readAiContext(block.contextPayload);
    if (!aiContext) {
      return block;
    }

    return {
      ...block,
      contextPayload: {
        aiContext: truncateForBudget(aiContext, perBlockBudget),
      },
    };
  });
}

function readAiContext(payload: Record<string, unknown>): string | null {
  const value = payload.aiContext;
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncateForBudget(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const safeMax = Math.max(0, maxChars);
  if (safeMax === 0) {
    return '';
  }

  if (safeMax <= 3) {
    return value.slice(0, safeMax);
  }

  return `${value.slice(0, safeMax - 3)}...`;
}
