import type { Logger } from '@/common/utils/logger';
import type { AdaptiveExemplarsPort } from '@/modules/wf1/application/ports/adaptive-exemplars.port';
import type { LlmPort, LlmReplyMetadata } from '@/modules/wf1/application/ports/llm.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import type { PromptTemplatesPort } from '@/modules/wf1/application/ports/prompt-templates.port';
import { EnrichContextByIntentUseCase } from '@/modules/wf1/application/use-cases/enrich-context-by-intent';
import {
  type ContextBlock,
} from '@/modules/wf1/domain/context-block';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import type { OutputValidatedIntentResult } from '@/modules/wf1/domain/output-validation';
import type { CatalogSnapshotItem, UiPayloadV1 } from '@/modules/wf1/domain/ui-payload';
import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import type { MessageHistoryItem } from '@/modules/wf1/domain/context-block';
import {
  handleGuestOrderLookupFlow,
  type GuestOrderLookupFlowDependencies,
} from '../flows/orders/guest-order-lookup.flow';
import {
  isShortIsolatedOrderAck,
  shouldContinueGuestOrderLookupFlow,
  type GuestOrderFlowState,
  resolveGuestOrderFlowStateFromHistory,
  resolveOrderDataAnswerStrength,
} from '../flows/orders/resolve-order-lookup-flow-state';
import { resolveOrderLookupRequest } from '../flows/orders/resolve-order-lookup-request';
import {
  handlePendingOrdersEscalationFlow,
} from '../flows/orders/pending-orders-escalation.flow';
import {
  formatDeterministicOrdersResponse,
  type OrdersDataSource,
} from '../flows/orders/orders-deterministic-formatter';
import { resolveOrdersDetailFollowup } from '../flows/orders/resolve-orders-detail-followup';
import {
  resolveOrdersEscalationFlowStateFromHistory,
  shouldContinueOrdersEscalationFlow,
  type OrdersEscalationFlowState,
} from '../flows/orders/resolve-orders-escalation-flow-state';
import {
  resolveRecommendationsMemoryFromHistory,
} from '../flows/recommendations/recommendations-memory';
import {
  handlePendingRecommendationsFlow,
} from '../flows/recommendations/pending-recommendations.flow';
import {
  type RecommendationDisambiguationState,
  resolveRecommendationFlowStateFromHistory,
  shouldContinueRecommendationsFlow,
} from '../flows/recommendations/resolve-recommendations-flow-state';
import { BACKEND_ERROR_MESSAGE, mapContextOrBackendError } from '../support/error-mapper';
import { checkIfAuthenticated } from '../support/check-if-authenticated';
import {
  shouldGuideOrdersReauthentication,
  shouldRescueOrdersIntent,
} from '../support/resolve-orders-authenticated-intent';
import { buildOrdersReauthenticationGuidanceResponse } from '../responses/orders/orders-unauthenticated-response';
import { resolveFallbackResponse } from './resolve-response-fallback';

export interface ResolveResponseInput {
  requestId: string;
  externalEventId: string;
  payload: {
    conversationId: string;
    source: 'web' | 'whatsapp';
    accessToken?: string;
    currency?: 'ARS' | 'USD';
  };
  clientIp?: string;
  sanitizedText: string;
  lookupSafeText: string;
  validatedIntent: {
    intent: string;
    entities: string[];
    sentiment: 'negative' | 'positive' | 'neutral';
  };
  routedIntent: string;
  routedIntentResult: OutputValidatedIntentResult & { intent: string };
  effectiveUserId: string;
  historyRows: ConversationHistoryRow[];
  history: MessageHistoryItem[];
  latestBotMessage: string | null;
  recursiveLearningEnabled: boolean;
  enrichContextByIntent: EnrichContextByIntentUseCase;
  llmPort: LlmPort;
  promptTemplates: PromptTemplatesPort;
  metricsPort: MetricsPort;
  adaptiveExemplars: AdaptiveExemplarsPort;
  guestOrderDependencies: GuestOrderLookupFlowDependencies;
  logger: Pick<Logger, 'chat' | 'warn'>;
}

export interface ResolveResponseResult {
  response: Wf1Response;
  contextBlocks?: ContextBlock[];
  llmMetadata?: LlmReplyMetadata;
  exactStockDisclosed: boolean;
  uiPayload?: UiPayloadV1;
  catalogSnapshot: CatalogSnapshotItem[];
  effectiveRoutedIntent: string;
  guestOrderFlowStateToPersist?: GuestOrderFlowState;
  recommendationsFlowStateToPersist?: RecommendationDisambiguationState;
  recommendationsFlowFranchiseToPersist?: string | null;
  recommendationsFlowCategoryHintToPersist?: string | null;
  recommendationsLastFranchiseToPersist?: string | null;
  recommendationsLastTypeToPersist?: string | null;
  recommendationsSnapshotTimestampToPersist?: number | null;
  recommendationsSnapshotSourceToPersist?: string | null;
  recommendationsSnapshotItemCountToPersist?: number | null;
  ordersEscalationFlowStateToPersist?: OrdersEscalationFlowState;
  llmAttempts: number;
  toolAttempts: number;
  pipelineFallbackCount: number;
  pipelineFallbackReasons: string[];
  intentRescuedTo?: string | null;
  intentRescueReason?: string | null;
  ordersDataSource?: OrdersDataSource | null;
  orderIdResolved?: string | null;
  orderStateRaw?: string | null;
  orderStateCanonical?: string | null;
  ordersStateConflict: boolean;
  ordersDeterministicReply: boolean;
  ordersGuestLookupAttempted: boolean;
  ordersGuestLookupResultCode:
    | 'success'
    | 'not_found_or_mismatch'
    | 'invalid_payload'
    | 'unauthorized'
    | 'throttled'
    | 'exception'
    | null;
  ordersGuestLookupStatusCode: number | null;
}

const ORDER_ITEMS_RENDER_MAX = 5;

export async function resolveResponse(input: ResolveResponseInput): Promise<ResolveResponseResult> {
  const state = buildInitialState(input);

  await resolveFlowResponse(input, state);
  await resolveFallbackResponse(input, state);

  return {
    response: state.response ?? {
      ok: false,
      message: BACKEND_ERROR_MESSAGE,
    },
    contextBlocks: state.contextBlocks,
    llmMetadata: state.llmMetadata,
    exactStockDisclosed: state.exactStockDisclosed,
    uiPayload: state.uiPayload,
    catalogSnapshot: state.catalogSnapshot,
    effectiveRoutedIntent: state.effectiveRoutedIntent,
    guestOrderFlowStateToPersist: state.guestOrderFlowStateToPersist,
    recommendationsFlowStateToPersist: state.recommendationsFlowStateToPersist,
    recommendationsFlowFranchiseToPersist: state.recommendationsFlowFranchiseToPersist,
    recommendationsFlowCategoryHintToPersist: state.recommendationsFlowCategoryHintToPersist,
    recommendationsLastFranchiseToPersist: state.recommendationsLastFranchiseToPersist,
    recommendationsLastTypeToPersist: state.recommendationsLastTypeToPersist,
    recommendationsSnapshotTimestampToPersist: state.recommendationsSnapshotTimestampToPersist,
    recommendationsSnapshotSourceToPersist: state.recommendationsSnapshotSourceToPersist,
    recommendationsSnapshotItemCountToPersist: state.recommendationsSnapshotItemCountToPersist,
    ordersEscalationFlowStateToPersist: state.ordersEscalationFlowStateToPersist,
    llmAttempts: state.llmAttempts,
    toolAttempts: state.toolAttempts,
    pipelineFallbackCount: state.pipelineFallbackCount,
    pipelineFallbackReasons: state.pipelineFallbackReasons,
    intentRescuedTo: state.intentRescuedTo,
    intentRescueReason: state.intentRescueReason,
    ordersDataSource: state.ordersDataSource,
    orderIdResolved: state.orderIdResolved,
    orderStateRaw: state.orderStateRaw,
    orderStateCanonical: state.orderStateCanonical,
    ordersStateConflict: state.ordersStateConflict,
    ordersDeterministicReply: state.ordersDeterministicReply,
    ordersGuestLookupAttempted: state.ordersGuestLookupAttempted,
    ordersGuestLookupResultCode: state.ordersGuestLookupResultCode,
    ordersGuestLookupStatusCode: state.ordersGuestLookupStatusCode,
  };
}

export interface MutableResolutionState {
  response?: Wf1Response;
  contextBlocks?: ContextBlock[];
  llmMetadata?: LlmReplyMetadata;
  exactStockDisclosed: boolean;
  uiPayload?: UiPayloadV1;
  catalogSnapshot: CatalogSnapshotItem[];
  guestOrderFlowStateToPersist?: GuestOrderFlowState;
  recommendationsFlowStateToPersist?: RecommendationDisambiguationState;
  recommendationsFlowFranchiseToPersist?: string | null;
  recommendationsFlowCategoryHintToPersist?: string | null;
  recommendationsLastFranchiseToPersist?: string | null;
  recommendationsLastTypeToPersist?: string | null;
  recommendationsSnapshotTimestampToPersist?: number | null;
  recommendationsSnapshotSourceToPersist?: string | null;
  recommendationsSnapshotItemCountToPersist?: number | null;
  ordersEscalationFlowStateToPersist?: OrdersEscalationFlowState;
  effectiveText: string;
  effectiveRoutedIntent: string;
  effectiveRoutedIntentResult: ResolveResponseInput['routedIntentResult'];
  currentRecommendationsMemory: ReturnType<typeof resolveRecommendationsMemoryFromHistory>;
  currentGuestOrderFlowState: GuestOrderFlowState;
  currentRecommendationsFlowState: ReturnType<typeof resolveRecommendationFlowStateFromHistory>;
  currentOrdersEscalationFlowState: OrdersEscalationFlowState;
  llmAttempts: number;
  toolAttempts: number;
  pipelineFallbackCount: number;
  pipelineFallbackReasons: string[];
  intentRescuedTo?: string | null;
  intentRescueReason?: string | null;
  ordersDataSource: OrdersDataSource | null;
  orderIdResolved: string | null;
  orderStateRaw: string | null;
  orderStateCanonical: string | null;
  ordersStateConflict: boolean;
  ordersDeterministicReply: boolean;
  ordersGuestLookupAttempted: boolean;
  ordersGuestLookupResultCode:
    | 'success'
    | 'not_found_or_mismatch'
    | 'invalid_payload'
    | 'unauthorized'
    | 'throttled'
    | 'exception'
    | null;
  ordersGuestLookupStatusCode: number | null;
}

function buildInitialState(input: ResolveResponseInput): MutableResolutionState {
  return {
    exactStockDisclosed: false,
    catalogSnapshot: [],
    effectiveText: input.sanitizedText,
    effectiveRoutedIntent: input.routedIntent,
    effectiveRoutedIntentResult: input.routedIntentResult,
    currentGuestOrderFlowState: resolveGuestOrderFlowStateFromHistory(input.historyRows),
    currentRecommendationsFlowState: resolveRecommendationFlowStateFromHistory(input.historyRows),
    currentRecommendationsMemory: resolveRecommendationsMemoryFromHistory(input.historyRows),
    currentOrdersEscalationFlowState: resolveOrdersEscalationFlowStateFromHistory(input.historyRows),
    llmAttempts: 0,
    toolAttempts: 0,
    pipelineFallbackCount: 0,
    pipelineFallbackReasons: [],
    ordersDataSource: null,
    orderIdResolved: null,
    orderStateRaw: null,
    orderStateCanonical: null,
    ordersStateConflict: false,
    ordersDeterministicReply: false,
    ordersGuestLookupAttempted: false,
    ordersGuestLookupResultCode: null,
    ordersGuestLookupStatusCode: null,
  };
}

async function resolveFlowResponse(
  input: ResolveResponseInput,
  state: MutableResolutionState,
): Promise<void> {
  applyAuthenticatedOrdersIntentRescue(input, state);

  if (
    shouldGuideOrdersReauthentication({
      accessToken: input.payload.accessToken,
      text: state.effectiveText,
    })
  ) {
    state.response = buildOrdersReauthenticationGuidanceResponse();
    state.pipelineFallbackCount += 1;
    state.pipelineFallbackReasons.push('orders_reauthentication_guidance');
    return;
  }

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

  observeOrderFlow(input, state, isGuestOrderFlow, shouldHandleGuestOrderFlow);

  if (shouldHandleGuestOrderFlow) {
    const guestOrderFlow = await handleGuestOrderLookupFlow(
      {
        requestId: input.requestId,
        conversationId: input.payload.conversationId,
        userId: input.effectiveUserId,
        clientIp: input.clientIp,
        text: guestLookupText,
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
    return;
  }

  if (shouldHandleOrdersEscalationFlow) {
    const pendingEscalationFlow = handlePendingOrdersEscalationFlow({
      text: input.sanitizedText,
      historyRows: input.historyRows,
    });
    state.response = pendingEscalationFlow.response;
    state.ordersEscalationFlowStateToPersist = pendingEscalationFlow.nextFlowState;
    return;
  }

  if (
    isGuestOrderFlow &&
    state.currentGuestOrderFlowState !== null &&
    state.effectiveRoutedIntent !== 'orders'
  ) {
    state.guestOrderFlowStateToPersist = null;
  }

  if (state.currentOrdersEscalationFlowState !== null) {
    state.ordersEscalationFlowStateToPersist = null;
  }

  if (!isGuestOrderFlow && state.effectiveRoutedIntent === 'orders') {
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
    if (state.response) {
      return;
    }
  }

  if (!shouldHandleRecommendationsPendingFlow) {
    return;
  }

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

function observeOrderFlow(
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

async function resolveAuthenticatedOrdersDeterministicResponse(
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

function applyAuthenticatedOrdersIntentRescue(
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
