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
  type GuestOrderLookupFlowDependencies,
} from '../flows/orders/guest-order-lookup.flow';
import {
  type GuestOrderFlowState,
  resolveGuestOrderFlowStateFromHistory,
} from '../flows/orders/resolve-order-lookup-flow-state';
import {
  type OrdersDataSource,
} from '../flows/orders/orders-deterministic-formatter';
import {
  resolveOrdersEscalationFlowStateFromHistory,
  type OrdersEscalationFlowState,
} from '../flows/orders/resolve-orders-escalation-flow-state';
import {
  resolveRecommendationsMemoryFromHistory,
} from '../flows/recommendations/recommendations-memory';
import {
  type RecommendationDisambiguationState,
  resolveRecommendationFlowStateFromHistory,
} from '../flows/recommendations/resolve-recommendations-flow-state';
import { BACKEND_ERROR_MESSAGE } from '../support/error-mapper';
import { resolveFallbackResponse } from './resolve-response-fallback';
import {
  applyAuthenticatedOrdersIntentRescue,
  computeFlowFlags,
  handleAuthenticatedOrdersFlowBranch,
  handleGuestOrderFlowBranch,
  handleOrdersEscalationFlowBranch,
  handleRecommendationsPendingFlowBranch,
  handleReauthenticationGuidance,
  observeOrderFlow,
  resetFlowStatesIfNeeded,
} from './resolve-flow-branches';

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

/** Pipeline telemetry: LLM attempts, tool calls, fallback counts. */
export interface PipelineMetrics {
  llmAttempts: number;
  toolAttempts: number;
  pipelineFallbackCount: number;
  pipelineFallbackReasons: string[];
}

/** Recommendations flow state and persistence fields. */
export interface RecommendationsResolutionFields {
  recommendationsFlowStateToPersist?: RecommendationDisambiguationState;
  recommendationsFlowFranchiseToPersist?: string | null;
  recommendationsFlowCategoryHintToPersist?: string | null;
  recommendationsLastFranchiseToPersist?: string | null;
  recommendationsLastTypeToPersist?: string | null;
  recommendationsSnapshotTimestampToPersist?: number | null;
  recommendationsSnapshotSourceToPersist?: string | null;
  recommendationsSnapshotItemCountToPersist?: number | null;
  recommendationsPromptedFranchiseToPersist?: string | null;
  currentRecommendationsMemory: ReturnType<typeof resolveRecommendationsMemoryFromHistory>;
  currentRecommendationsFlowState: ReturnType<typeof resolveRecommendationFlowStateFromHistory>;
}

/** Orders flow state, guest lookup, escalation, and deterministic response fields. */
export interface OrdersResolutionFields {
  guestOrderFlowStateToPersist?: GuestOrderFlowState;
  ordersEscalationFlowStateToPersist?: OrdersEscalationFlowState;
  offeredEscalationToPersist?: boolean;
  currentGuestOrderFlowState: GuestOrderFlowState;
  currentOrdersEscalationFlowState: OrdersEscalationFlowState;
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

export interface MutableResolutionState
  extends PipelineMetrics,
    RecommendationsResolutionFields,
    OrdersResolutionFields {
  response?: Wf1Response;
  contextBlocks?: ContextBlock[];
  llmMetadata?: LlmReplyMetadata;
  exactStockDisclosed: boolean;
  uiPayload?: UiPayloadV1;
  catalogSnapshot: CatalogSnapshotItem[];
  effectiveText: string;
  effectiveRoutedIntent: string;
  effectiveRoutedIntentResult: ResolveResponseInput['routedIntentResult'];
  intentRescuedTo?: string | null;
  intentRescueReason?: string | null;
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

  const flowFlags = computeFlowFlags(input, state);

  if (handleReauthenticationGuidance(input, state)) {
    return;
  }

  observeOrderFlow(input, state, flowFlags.isGuestOrderFlow, flowFlags.shouldHandleGuestOrderFlow);

  if (flowFlags.shouldHandleGuestOrderFlow) {
    await handleGuestOrderFlowBranch(input, state);
    return;
  }

  if (flowFlags.shouldHandleOrdersEscalationFlow) {
    handleOrdersEscalationFlowBranch(input, state);
    return;
  }

  resetFlowStatesIfNeeded(input, state, flowFlags);

  if (flowFlags.shouldHandleAuthenticatedOrdersFlow) {
    const handled = await handleAuthenticatedOrdersFlowBranch(input, state);
    if (handled) {
      return;
    }
  }

  if (!flowFlags.shouldHandleRecommendationsPendingFlow) {
    return;
  }

  handleRecommendationsPendingFlowBranch(input, state);
}

export interface FlowFlags {
  isGuestOrderFlow: boolean;
  shouldHandleGuestOrderFlow: boolean;
  shouldHandleRecommendationsPendingFlow: boolean;
  shouldHandleOrdersEscalationFlow: boolean;
  shouldHandleAuthenticatedOrdersFlow: boolean;
}
