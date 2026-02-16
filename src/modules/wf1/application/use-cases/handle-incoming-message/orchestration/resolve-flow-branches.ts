import {
  handleGuestOrderLookupFlow,
} from '../flows/orders/guest-order-lookup.flow';
import {
  isShortIsolatedOrderAck,
  shouldContinueGuestOrderLookupFlow,
  resolveOrderDataAnswerStrength,
} from '../flows/orders/resolve-order-lookup-flow-state';
import { resolveOrderLookupRequest } from '../flows/orders/resolve-order-lookup-request';
import { handlePendingOrdersEscalationFlow } from '../flows/orders/pending-orders-escalation.flow';
import { formatDeterministicOrdersResponse } from '../flows/orders/orders-deterministic-formatter';
import { resolveOrdersDetailFollowup } from '../flows/orders/resolve-orders-detail-followup';
import {
  shouldContinueOrdersEscalationFlow,
} from '../flows/orders/resolve-orders-escalation-flow-state';
import { handlePendingRecommendationsFlow } from '../flows/recommendations/pending-recommendations.flow';
import { shouldContinueRecommendationsFlow } from '../flows/recommendations/resolve-recommendations-flow-state';
import { mapContextOrBackendError } from '../support/error-mapper';
import { checkIfAuthenticated } from '../support/check-if-authenticated';
import {
  shouldGuideOrdersReauthentication,
  shouldRescueOrdersIntent,
} from '../support/resolve-orders-authenticated-intent';
import { buildOrdersReauthenticationGuidanceResponse } from '../responses/orders/orders-unauthenticated-response';
import type {
  MutableResolutionState,
  ResolveResponseInput,
  FlowFlags,
} from './resolve-response';

const ORDER_ITEMS_RENDER_MAX = 5;

export function computeFlowFlags(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): FlowFlags {
  const isGuestOrderFlow = !checkIfAuthenticated(input.payload.accessToken);
  const guestLookupText = input.lookupSafeText;
  const guestOrderLookupSignals = resolveOrderLookupRequest({
    text: guestLookupText,
    entities: input.validatedIntent.entities,
  });
  const hasStrongGuestOrderLookupSignals =
    Boolean(guestOrderLookupSignals.orderId) &&
    (guestOrderLookupSignals.providedFactors > 0 ||
      guestOrderLookupSignals.invalidFactors.length > 0);
  const shouldContinueGuestOrderFlow =
    isGuestOrderFlow &&
    shouldContinueGuestOrderLookupFlow({
      currentFlowState: state.currentGuestOrderFlowState,
      text: guestLookupText,
      entities: input.validatedIntent.entities,
      routedIntent: state.effectiveRoutedIntent,
    });
  const shouldHandleGuestOrderFlow =
    isGuestOrderFlow &&
    (state.effectiveRoutedIntent === 'orders' ||
      shouldContinueGuestOrderFlow ||
      hasStrongGuestOrderLookupSignals);
  const shouldHandleRecommendationsPendingFlow =
    !shouldHandleGuestOrderFlow &&
    shouldContinueRecommendationsFlow({
      currentFlowState: state.currentRecommendationsFlowState.state,
      text: input.sanitizedText,
      entities: input.validatedIntent.entities,
    });
  const shouldHandleOrdersEscalationFlow =
    !shouldHandleGuestOrderFlow &&
    !shouldHandleRecommendationsPendingFlow &&
    shouldContinueOrdersEscalationFlow({
      currentFlowState: state.currentOrdersEscalationFlowState,
      text: input.sanitizedText,
      routedIntent: state.effectiveRoutedIntent,
    });
  const shouldHandleAuthenticatedOrdersFlow =
    !isGuestOrderFlow && state.effectiveRoutedIntent === 'orders';

  return {
    isGuestOrderFlow,
    shouldHandleGuestOrderFlow,
    shouldHandleRecommendationsPendingFlow,
    shouldHandleOrdersEscalationFlow,
    shouldHandleAuthenticatedOrdersFlow,
  };
}

export function handleReauthenticationGuidance(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): boolean {
  if (
    !shouldGuideOrdersReauthentication({
      accessToken: input.payload.accessToken,
      text: state.effectiveText,
    })
  ) {
    return false;
  }
  state.response = buildOrdersReauthenticationGuidanceResponse();
  state.pipelineFallbackCount += 1;
  state.pipelineFallbackReasons.push('orders_reauthentication_guidance');
  return true;
}

export async function handleGuestOrderFlowBranch(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): Promise<void> {
  const guestOrderFlow = await handleGuestOrderLookupFlow(
    {
      requestId: input.requestId,
      conversationId: input.payload.conversationId,
      userId: input.effectiveUserId,
      clientIp: input.clientIp,
      text: input.lookupSafeText,
      entities: input.validatedIntent.entities,
      currentFlowState: state.currentGuestOrderFlowState,
    },
    input.guestOrderDependencies,
  );
  state.response = guestOrderFlow.response;
  state.guestOrderFlowStateToPersist = guestOrderFlow.nextFlowState;
  state.ordersGuestLookupAttempted = guestOrderFlow.lookupTelemetry.ordersGuestLookupAttempted;
  state.ordersGuestLookupResultCode = guestOrderFlow.lookupTelemetry.ordersGuestLookupResultCode;
  state.ordersGuestLookupStatusCode = guestOrderFlow.lookupTelemetry.ordersGuestLookupStatusCode;
}

export function handleOrdersEscalationFlowBranch(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): void {
  const pendingEscalationFlow = handlePendingOrdersEscalationFlow({
    text: input.sanitizedText,
    historyRows: input.historyRows,
  });
  state.response = pendingEscalationFlow.response;
  state.ordersEscalationFlowStateToPersist = pendingEscalationFlow.nextFlowState;
}

export function resetFlowStatesIfNeeded(
  input: ResolveResponseInput,
  state: MutableResolutionState,
  flowFlags: FlowFlags,
): void {
  if (
    flowFlags.isGuestOrderFlow &&
    state.currentGuestOrderFlowState !== null &&
    state.effectiveRoutedIntent !== 'orders'
  ) {
    state.guestOrderFlowStateToPersist = null;
  }

  if (state.currentOrdersEscalationFlowState !== null) {
    state.ordersEscalationFlowStateToPersist = null;
  }
}

export async function handleAuthenticatedOrdersFlowBranch(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): Promise<boolean> {
  const authenticatedOrderLookupSignals = resolveOrderLookupRequest({
    text: state.effectiveText,
    entities: state.effectiveRoutedIntentResult.entities,
  });
  const orderFollowupResolution = resolveOrdersDetailFollowup({
    text: state.effectiveText,
    historyRows: input.historyRows,
    explicitOrderId: authenticatedOrderLookupSignals.orderId
      ? String(authenticatedOrderLookupSignals.orderId)
      : null,
  });

  await resolveAuthenticatedOrdersDeterministicResponse(
    input,
    state,
    {
      requestedOrderId: orderFollowupResolution.resolvedOrderId,
      includeOrderItems: orderFollowupResolution.includeOrderItems,
    },
  );
  return Boolean(state.response);
}

export function handleRecommendationsPendingFlowBranch(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): void {
  const recommendationFlow = handlePendingRecommendationsFlow({
    currentFlow: state.currentRecommendationsFlowState,
    text: input.sanitizedText,
    entities: input.validatedIntent.entities,
  });

  if (recommendationFlow.response) {
    state.response = recommendationFlow.response;
  } else {
    state.effectiveText = recommendationFlow.rewrittenText;
    state.effectiveRoutedIntent = 'recommendations';
    state.effectiveRoutedIntentResult = {
      ...input.routedIntentResult,
      intent: 'recommendations',
      entities: recommendationFlow.entitiesOverride,
    };
  }

  state.recommendationsFlowStateToPersist = recommendationFlow.nextState;
  state.recommendationsFlowFranchiseToPersist = recommendationFlow.nextFranchise;
  state.recommendationsFlowCategoryHintToPersist = recommendationFlow.nextCategoryHint;

  if (recommendationFlow.resolved) {
    input.metricsPort.incrementRecommendationsDisambiguationResolved();
  }
}

export function observeOrderFlow(
  input: ResolveResponseInput,
  state: MutableResolutionState,
  isGuestOrderFlow: boolean,
  shouldHandleGuestOrderFlow: boolean,
): void {
  if (!isGuestOrderFlow || state.currentGuestOrderFlowState === null) {
    return;
  }

  const answerStrength = resolveOrderDataAnswerStrength(input.sanitizedText);
  if (answerStrength === 'weak_yes' && !isShortIsolatedOrderAck(input.sanitizedText)) {
    input.metricsPort.incrementOrderFlowAmbiguousAck();
  }

  if (!shouldHandleGuestOrderFlow && state.effectiveRoutedIntent !== 'orders') {
    input.metricsPort.incrementOrderFlowHijackPrevented();
  }
}

export async function resolveAuthenticatedOrdersDeterministicResponse(
  input: ResolveResponseInput,
  state: MutableResolutionState,
  options: {
    requestedOrderId?: string | null;
    includeOrderItems?: boolean;
  },
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
      orderIdOverride: options.requestedOrderId ?? undefined,
    });

    const deterministicResolution = formatDeterministicOrdersResponse({
      conversationId: input.payload.conversationId,
      contextBlocks: state.contextBlocks ?? [],
      requestedOrderId: options.requestedOrderId ?? null,
      includeOrderItems: options.includeOrderItems ?? false,
      orderItemsMax: ORDER_ITEMS_RENDER_MAX,
    });

    state.response = deterministicResolution.response;
    state.ordersDataSource = deterministicResolution.ordersDataSource;
    state.orderIdResolved = deterministicResolution.orderIdResolved;
    state.orderStateRaw = deterministicResolution.orderStateRaw;
    state.orderStateCanonical = deterministicResolution.orderStateCanonical;
    state.ordersStateConflict = deterministicResolution.ordersStateConflict;
    state.ordersDeterministicReply = deterministicResolution.ordersDeterministicReply;
  } catch (error: unknown) {
    state.response = mapContextOrBackendError(error);
    state.ordersDeterministicReply = false;
  }
}

export function applyAuthenticatedOrdersIntentRescue(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): void {
  const rescueResolution = shouldRescueOrdersIntent({
    accessToken: input.payload.accessToken,
    routedIntent: state.effectiveRoutedIntent,
    text: state.effectiveText,
    entities: state.effectiveRoutedIntentResult.entities,
  });

  if (!rescueResolution.shouldRescue) {
    return;
  }

  state.effectiveRoutedIntent = 'orders';
  state.effectiveRoutedIntentResult = {
    ...state.effectiveRoutedIntentResult,
    intent: 'orders',
  };
  state.intentRescuedTo = 'orders';
  state.intentRescueReason = rescueResolution.reason;
}
