import type { Logger } from '@/common/utils/logger';
import type { AuditPort } from '@/modules/wf1/application/ports/audit.port';
import type { ChatPersistencePort } from '@/modules/wf1/application/ports/chat-persistence.port';
import type { IdempotencyPort } from '@/modules/wf1/application/ports/idempotency.port';
import type { LlmReplyMetadata } from '@/modules/wf1/application/ports/llm.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import {
  dedupeAssistantGreeting,
  sanitizeAssistantUserMessage,
  sanitizeEmptyListItems,
} from '@/modules/wf1/domain/assistant-output-safety';
import { sanitizeCatalogNarrativeMessage } from '@/modules/wf1/domain/assistant-output-safety/catalog-narrative';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import type { CatalogSnapshotItem, UiPayloadV1 } from '@/modules/wf1/domain/ui-payload';
import { getResponseAuditStatus, type Wf1Response } from '@/modules/wf1/domain/wf1-response';
import {
  buildRecommendationsMemoryMetadata,
} from '../flows/recommendations/recommendations-memory';
import type { RecommendationDisambiguationState } from '../flows/recommendations/resolve-recommendations-flow-state';
import type { GuestOrderFlowState } from '../flows/orders/resolve-order-lookup-flow-state';
import {
  OFFERED_ESCALATION_METADATA_KEY,
  type OrdersEscalationFlowState,
} from '../flows/orders/resolve-orders-escalation-flow-state';
import { buildSharedTurnMetadata } from '../support/build-turn-metadata';
import { LLM_PATH_FALLBACK_DEFAULT, STORE_INFO_POLICY_VERSION } from '../support/constants';
import {
  buildOrdersEscalationFlowMetadata,
  buildRecommendationsFlowMetadata,
  resolveStoreInfoSubtype,
} from '../support/handle-incoming-message.helpers';

export interface FinalizeSuccessInput {
  requestId: string;
  externalEventId: string;
  payload: {
    source: 'web' | 'whatsapp';
    conversationId: string;
    userId: string;
  };
  startedAt: number;
  sanitizedText: string;
  effectiveUserId: string;
  response: Wf1Response;
  routedIntent: string;
  effectiveRoutedIntent: string;
  validatedIntent: {
    confidence: number;
    entities: string[];
    sentiment: 'negative' | 'positive' | 'neutral';
  };
  contextBlocks?: ContextBlock[];
  llmMetadata?: LlmReplyMetadata;
  exactStockDisclosed: boolean;
  uiPayload?: UiPayloadV1;
  catalogSnapshot: CatalogSnapshotItem[];
  latestBotMessage: string | null;
  guestOrderFlowStateToPersist?: GuestOrderFlowState;
  recommendationsFlowStateToPersist?: RecommendationDisambiguationState;
  recommendationsFlowFranchiseToPersist?: string | null;
  recommendationsFlowCategoryHintToPersist?: string | null;
  recommendationsLastFranchiseToPersist?: string | null;
  recommendationsLastTypeToPersist?: string | null;
  recommendationsSnapshotTimestampToPersist?: number | null;
  recommendationsSnapshotSourceToPersist?: string | null;
  recommendationsSnapshotItemCountToPersist?: number | null;
  recommendationsPromptedFranchiseToPersist?: string | null;
  ordersEscalationFlowStateToPersist?: OrdersEscalationFlowState;
  offeredEscalationToPersist?: boolean;
  llmAttempts: number;
  toolAttempts: number;
  pipelineFallbackCount: number;
  pipelineFallbackReasons: string[];
  intentRescuedTo?: string | null;
  intentRescueReason?: string | null;
  ordersDataSource?: 'list' | 'detail' | 'conflict' | null;
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
  authPresent: boolean;
  chatPersistence: ChatPersistencePort;
  idempotencyPort: IdempotencyPort;
  auditPort: AuditPort;
  metricsPort: MetricsPort;
  logger: Pick<Logger, 'chat' | 'info'>;
}

export async function finalizeSuccess(input: FinalizeSuccessInput): Promise<Wf1Response> {
  const sanitizedResponse = sanitizeResponseMessage({
    requestId: input.requestId,
    conversationId: input.payload.conversationId,
    response: input.response,
    effectiveRoutedIntent: input.effectiveRoutedIntent,
    latestBotMessage: input.latestBotMessage,
    uiPayload: input.uiPayload,
    metricsPort: input.metricsPort,
    logger: input.logger,
  });

  // Use metadata flag exclusively (no message parsing fallback)
  const offeredEscalation = input.offeredEscalationToPersist === true;

  const persistedEscalationState =
    input.ordersEscalationFlowStateToPersist === undefined && offeredEscalation
      ? 'awaiting_cancelled_reason_confirmation'
      : input.ordersEscalationFlowStateToPersist;

  const auditStatus = getResponseAuditStatus(sanitizedResponse);
  const contextTypes = Array.isArray(input.contextBlocks)
    ? input.contextBlocks.map((block) => block.contextType)
    : [];
  const storeInfoSubtype = resolveStoreInfoSubtype(input.contextBlocks);
  const storeInfoPolicyVersion = storeInfoSubtype ? STORE_INFO_POLICY_VERSION : null;
  const uiCardsCount = input.uiPayload?.cards.length ?? 0;
  const uiCardsWithImageCount =
    input.uiPayload?.cards.filter(
      (card) => typeof card.thumbnailUrl === 'string' && card.thumbnailUrl.length > 0,
    ).length ?? 0;
  const catalogSnapshotMetadata =
    input.catalogSnapshot.length > 0 ? { catalogSnapshot: input.catalogSnapshot } : {};
  const guestOrderFlowMetadata =
    input.guestOrderFlowStateToPersist === undefined
      ? {}
      : { ordersGuestFlowState: input.guestOrderFlowStateToPersist };
  const recommendationsFlowMetadata = buildRecommendationsFlowMetadata({
    state: input.recommendationsFlowStateToPersist,
    franchise: input.recommendationsFlowFranchiseToPersist,
    categoryHint: input.recommendationsFlowCategoryHintToPersist,
  });
  const recommendationsMemoryMetadata = buildRecommendationsMemoryMetadata({
    lastFranchise: input.recommendationsLastFranchiseToPersist,
    lastType: input.recommendationsLastTypeToPersist,
    snapshotTimestamp: input.recommendationsSnapshotTimestampToPersist,
    snapshotSource: input.recommendationsSnapshotSourceToPersist,
    snapshotItemCount: input.recommendationsSnapshotItemCountToPersist,
    promptedFranchise: input.recommendationsPromptedFranchiseToPersist,
  });
  const ordersEscalationFlowMetadata = {
    ...buildOrdersEscalationFlowMetadata(persistedEscalationState),
    ...(input.offeredEscalationToPersist !== undefined
      ? { [OFFERED_ESCALATION_METADATA_KEY]: input.offeredEscalationToPersist }
      : {}),
  };

  const sharedTurnMetadata = buildSharedTurnMetadata({
    routedIntent: input.routedIntent,
    predictedConfidence: input.validatedIntent.confidence,
    predictedEntitiesCount: input.validatedIntent.entities.length,
    sentiment: input.validatedIntent.sentiment,
    llmMetadata: input.llmMetadata,
    contextTypes,
    conversationId: input.payload.conversationId,
    requestId: input.requestId,
    externalEventId: input.externalEventId,
    discloseExactStock: input.exactStockDisclosed,
    storeInfoSubtype,
    storeInfoPolicyVersion,
    uiPayloadVersion: input.uiPayload?.version ?? null,
    uiKind: input.uiPayload?.kind ?? null,
    uiCardsCount,
    uiCardsWithImageCount,
    guestOrderFlowMetadata,
    recommendationsFlowMetadata,
    recommendationsMemoryMetadata,
    ordersEscalationFlowMetadata,
    authPresent: input.authPresent,
    llmAttempts: input.llmAttempts,
    toolAttempts: input.toolAttempts,
    pipelineFallbackCount: input.pipelineFallbackCount,
    pipelineFallbackReasons: input.pipelineFallbackReasons,
    intentRescuedTo: input.intentRescuedTo ?? null,
    intentRescueReason: input.intentRescueReason ?? null,
    ordersDataSource: input.ordersDataSource ?? null,
    orderIdResolved: input.orderIdResolved ?? null,
    orderStateRaw: input.orderStateRaw ?? null,
    orderStateCanonical: input.orderStateCanonical ?? null,
    ordersStateConflict: input.ordersStateConflict,
    ordersDeterministicReply: input.ordersDeterministicReply,
    ordersGuestLookupAttempted: input.ordersGuestLookupAttempted,
    ordersGuestLookupResultCode: input.ordersGuestLookupResultCode,
    ordersGuestLookupStatusCode: input.ordersGuestLookupStatusCode,
  });

  const persistedTurn = await input.chatPersistence.persistTurn({
    conversationId: input.payload.conversationId,
    userId: input.effectiveUserId,
    source: input.payload.source,
    externalEventId: input.externalEventId,
    userMessage: input.sanitizedText,
    botMessage: sanitizedResponse.message,
    intent: sanitizedResponse.ok ? sanitizedResponse.intent ?? 'general' : 'error',
    metadata: {
      requiresAuth: auditStatus.requiresAuth,
      ...sharedTurnMetadata,
      ...catalogSnapshotMetadata,
    },
  });

  const responseWithId = sanitizedResponse.ok
    ? {
        ...sanitizedResponse,
        responseId: persistedTurn.botMessageId,
      }
    : sanitizedResponse;

  input.logger.info('final_stage_persisted', {
    event: 'final_stage_persisted',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    intent: responseWithId.ok ? responseWithId.intent ?? 'general' : 'error',
    source: input.payload.source,
    outbox_expected: input.payload.source === 'whatsapp',
    latency_ms: Date.now() - input.startedAt,
  });

  await input.idempotencyPort.markProcessed({
    source: input.payload.source,
    externalEventId: input.externalEventId,
  });

  await input.auditPort.writeAudit({
    requestId: input.requestId,
    userId: input.effectiveUserId,
    conversationId: input.payload.conversationId,
    source: input.payload.source,
    intent: responseWithId.ok ? responseWithId.intent ?? 'general' : 'error',
    status: auditStatus.status,
    message: responseWithId.message,
    httpStatus: 200,
    latencyMs: Date.now() - input.startedAt,
    metadata: {
      externalEventId: input.externalEventId,
      ...sharedTurnMetadata,
      responseType: auditStatus.responseType,
    },
  });

  const llmPath = input.llmMetadata?.llmPath ?? LLM_PATH_FALLBACK_DEFAULT;
  input.metricsPort.incrementMessage({
    source: input.payload.source,
    intent: responseWithId.ok ? responseWithId.intent ?? input.effectiveRoutedIntent : 'error',
    llmPath,
  });
  input.metricsPort.observeResponseLatency({
    intent: responseWithId.ok ? responseWithId.intent ?? input.effectiveRoutedIntent : 'error',
    seconds: (Date.now() - input.startedAt) / 1000,
  });
  if (input.exactStockDisclosed) {
    input.metricsPort.incrementStockExactDisclosure();
  }

  input.logger.info('final_stage_audited', {
    event: 'final_stage_audited',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    intent: responseWithId.ok ? responseWithId.intent ?? 'general' : 'error',
    source: input.payload.source,
    status: auditStatus.status,
    latency_ms: Date.now() - input.startedAt,
  });

  return responseWithId;
}

function sanitizeResponseMessage(input: {
  requestId: string;
  conversationId: string;
  response: Wf1Response;
  effectiveRoutedIntent: string;
  latestBotMessage: string | null;
  uiPayload?: UiPayloadV1;
  metricsPort: MetricsPort;
  logger: Pick<Logger, 'chat'>;
}): Wf1Response {
  const sanitizedAssistantOutput = sanitizeAssistantUserMessage(input.response.message);
  let sanitizedAssistantMessage = sanitizeEmptyListItems(sanitizedAssistantOutput.message);
  if (sanitizedAssistantOutput.rewritten) {
    input.metricsPort.incrementOutputTechnicalTermsSanitized();
    input.logger.chat('assistant_output_sanitized', {
      event: 'assistant_output_sanitized',
      request_id: input.requestId,
      conversation_id: input.conversationId,
      intent: input.response.ok ? input.response.intent ?? input.effectiveRoutedIntent : 'error',
      rewrite_reason_count: sanitizedAssistantOutput.reasons.length,
      rewrite_reasons: sanitizedAssistantOutput.reasons,
    });
  }

  if (input.response.ok) {
    const catalogNarrativeSanitization = sanitizeCatalogNarrativeMessage({
      message: sanitizedAssistantMessage,
      uiPayload: input.uiPayload,
    });
    if (catalogNarrativeSanitization.rewritten) {
      input.logger.chat('catalog_narrative_sanitized', {
        event: 'catalog_narrative_sanitized',
        request_id: input.requestId,
        conversation_id: input.conversationId,
        intent: input.response.intent ?? input.effectiveRoutedIntent,
        rewrite_reasons: catalogNarrativeSanitization.reasons,
      });
    }
    sanitizedAssistantMessage = catalogNarrativeSanitization.message;

    const greetingDeduplication = dedupeAssistantGreeting({
      message: sanitizedAssistantMessage,
      previousBotMessage: input.latestBotMessage,
    });
    if (greetingDeduplication.rewritten) {
      input.logger.chat('assistant_greeting_deduped', {
        event: 'assistant_greeting_deduped',
        request_id: input.requestId,
        conversation_id: input.conversationId,
        intent: input.response.intent ?? input.effectiveRoutedIntent,
        reason: greetingDeduplication.reason ?? 'repeated_greeting_removed',
      });
    }
    sanitizedAssistantMessage = greetingDeduplication.message;
  }

  return {
    ...input.response,
    message: sanitizedAssistantMessage,
  };
}
