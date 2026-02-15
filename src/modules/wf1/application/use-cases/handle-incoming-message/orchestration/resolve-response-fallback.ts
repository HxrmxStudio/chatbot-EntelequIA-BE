import { areStringArraysEqual } from '@/common/utils/array.utils';
import { resolveBusinessPolicyDirectAnswer } from '../flows/policy/resolve-business-policy-direct-answer';
import { resolveDomainScope } from '../flows/policy/resolve-domain-scope';
import {
  resolveLatestCatalogSnapshotFromHistory,
  resolvePriceComparisonItem,
  resolvePriceComparisonRequestIntent,
} from '../flows/pricing/resolve-price-comparison-followup';
import { resolveRecommendationContinuation } from '../flows/recommendations/recommendations-memory';
import { isPoliteClosing } from '../flows/recommendations/resolve-recommendations-flow-state';
import {
  buildCheapestPriceMessage,
  buildMostExpensivePriceMessage,
  buildPriceComparisonMissingSnapshotMessage,
} from '../responses/pricing/price-comparison-response';
import { resolveContextFallback as resolveContextFallbackPhase } from './resolve-response-context';
import type { MutableResolutionState, ResolveResponseInput } from './resolve-response';

export async function resolveFallbackResponse(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): Promise<void> {
  resolveContinuationFallback(state);
  resolvePriceComparisonFallback(input, state);
  resolveBusinessPolicyFallback(input, state);
  resolveScopeFallback(input, state);

  if (!state.response) {
    await resolveContextFallbackPhase(input, state);
  }
}

function resolveContinuationFallback(state: MutableResolutionState): void {
  if (state.response) {
    return;
  }

  const continuationResolution = resolveRecommendationContinuation({
    text: state.effectiveText,
    entities: state.effectiveRoutedIntentResult.entities,
    routedIntent: state.effectiveRoutedIntent,
    memory: state.currentRecommendationsMemory,
  });

  if (
    continuationResolution.forceRecommendationsIntent &&
    state.effectiveRoutedIntent !== 'recommendations' &&
    !isPoliteClosing(state.effectiveText)
  ) {
    state.effectiveRoutedIntent = 'recommendations';
    state.effectiveRoutedIntentResult = {
      ...state.effectiveRoutedIntentResult,
      intent: 'recommendations',
    };
  }

  if (
    continuationResolution.rewrittenText !== state.effectiveText ||
    !areStringArraysEqual(
      continuationResolution.entitiesOverride,
      state.effectiveRoutedIntentResult.entities,
    )
  ) {
    state.effectiveText = continuationResolution.rewrittenText;
    state.effectiveRoutedIntentResult = {
      ...state.effectiveRoutedIntentResult,
      entities: continuationResolution.entitiesOverride,
    };
  }
}

function resolvePriceComparisonFallback(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): void {
  if (state.response) {
    return;
  }

  const priceComparisonIntent = resolvePriceComparisonRequestIntent(input.sanitizedText);
  if (priceComparisonIntent === 'none') {
    return;
  }

  const snapshot = resolveLatestCatalogSnapshotFromHistory(input.historyRows);
  if (snapshot.length === 0) {
    const rememberedFranchise = state.currentRecommendationsMemory.lastFranchise;
    if (rememberedFranchise) {
      const franchiseText = rememberedFranchise.replace(/_/g, ' ');
      state.effectiveRoutedIntent = 'recommendations';
      state.effectiveRoutedIntentResult = {
        ...state.effectiveRoutedIntentResult,
        intent: 'recommendations',
        entities: appendIfMissingEntity(
          state.effectiveRoutedIntentResult.entities,
          franchiseText,
        ),
      };
      state.effectiveText = `mostrame opciones de ${franchiseText} ordenadas por precio de menor a mayor`;
      state.pipelineFallbackCount += 1;
      state.pipelineFallbackReasons.push('price_comparison_snapshot_missing_requery');
      return;
    }

    state.response = {
      ok: true,
      conversationId: input.payload.conversationId,
      intent: 'products',
      message: buildPriceComparisonMissingSnapshotMessage(),
    };
    state.pipelineFallbackCount += 1;
    state.pipelineFallbackReasons.push('price_comparison_snapshot_missing_clarify');
    return;
  }

  state.catalogSnapshot = snapshot;
  const selected = resolvePriceComparisonItem({
    intent: priceComparisonIntent,
    items: snapshot,
  });

  state.response = selected
    ? {
        ok: true,
        conversationId: input.payload.conversationId,
        intent: 'products',
        message:
          priceComparisonIntent === 'cheapest'
            ? buildCheapestPriceMessage({
                item: selected,
                comparedCount: snapshot.length,
              })
            : buildMostExpensivePriceMessage({
                item: selected,
                comparedCount: snapshot.length,
              }),
      }
    : {
        ok: true,
        conversationId: input.payload.conversationId,
        intent: 'products',
        message: buildPriceComparisonMissingSnapshotMessage(),
      };
}

function resolveBusinessPolicyFallback(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): void {
  if (state.response) {
    return;
  }

  const policyDirectAnswer = resolveBusinessPolicyDirectAnswer(state.effectiveText);
  if (!policyDirectAnswer) {
    return;
  }

  state.response = {
    ok: true,
    conversationId: input.payload.conversationId,
    intent: policyDirectAnswer.intent,
    message: policyDirectAnswer.message,
  };
  state.pipelineFallbackCount += 1;
  state.pipelineFallbackReasons.push(`business_policy_${policyDirectAnswer.policyType}`);
  if (policyDirectAnswer.policyType === 'returns') {
    input.metricsPort.incrementReturnsPolicyDirectAnswer();
  }
  input.metricsPort.incrementPolicyDirectAnswer({
    policyType: policyDirectAnswer.policyType,
  });
  input.logger.chat('business_policy_direct_answer', {
    event: 'business_policy_direct_answer',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    intent: policyDirectAnswer.intent,
    policy_type: policyDirectAnswer.policyType,
  });
}

function resolveScopeFallback(input: ResolveResponseInput, state: MutableResolutionState): void {
  if (state.response) {
    return;
  }

  const domainScope = resolveDomainScope({
    text: state.effectiveText,
    routedIntent: state.effectiveRoutedIntent,
  });
  if (domainScope.type === 'in_scope') {
    return;
  }

  state.response = {
    ok: true,
    conversationId: input.payload.conversationId,
    intent: 'general',
    message: domainScope.message,
  };
  state.pipelineFallbackCount += 1;
  state.pipelineFallbackReasons.push(`scope_${domainScope.type}`);
  input.metricsPort.incrementScopeRedirect({ reason: domainScope.type });
  input.logger.chat('scope_redirect_applied', {
    event: 'scope_redirect_applied',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    routed_intent: state.effectiveRoutedIntent,
    scope_type: domainScope.type,
  });
}

function appendIfMissingEntity(entities: string[], candidate: string): string[] {
  const normalizedCandidate = candidate.trim().toLowerCase();
  if (normalizedCandidate.length === 0) {
    return entities;
  }

  for (const entity of entities) {
    if (entity.trim().toLowerCase() === normalizedCandidate) {
      return entities;
    }
  }

  return [...entities, candidate];
}
