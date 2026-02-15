import type { LlmReplyMetadata } from '../../../ports/llm.port';
import {
  LLM_PATH_FALLBACK_DEFAULT,
  LOW_STOCK_THRESHOLD,
  RESPONSE_POLICY_VERSION,
} from './constants';

export interface BuildSharedTurnMetadataInput {
  routedIntent: string;
  predictedConfidence: number;
  predictedEntitiesCount: number;
  sentiment: string;
  llmMetadata: LlmReplyMetadata | undefined;
  contextTypes: string[];
  conversationId: string;
  requestId: string;
  externalEventId: string;
  discloseExactStock: boolean;
  storeInfoSubtype: string | null;
  storeInfoPolicyVersion: string | null;
  uiPayloadVersion: string | null;
  uiKind: string | null;
  uiCardsCount: number;
  uiCardsWithImageCount: number;
  guestOrderFlowMetadata: Record<string, unknown>;
  recommendationsFlowMetadata: Record<string, unknown>;
  recommendationsMemoryMetadata: Record<string, unknown>;
  ordersEscalationFlowMetadata: Record<string, unknown>;
  authPresent: boolean;
  llmAttempts: number;
  toolAttempts: number;
  pipelineFallbackCount: number;
  pipelineFallbackReasons: string[];
  intentRescuedTo: string | null;
  intentRescueReason: string | null;
  ordersDataSource?: 'list' | 'detail' | 'conflict' | null;
  orderIdResolved?: string | null;
  orderStateRaw?: string | null;
  orderStateCanonical?: string | null;
  ordersStateConflict: boolean;
  ordersDeterministicReply: boolean;
}

/**
 * Builds the shared turn metadata used by both persistTurn and writeAudit.
 * Callers add their specific fields (e.g. requiresAuth, catalogSnapshot for persist; responseType for audit).
 */
export function buildSharedTurnMetadata(input: BuildSharedTurnMetadataInput): Record<string, unknown> {
  const llm = input.llmMetadata;
  return {
    predictedIntent: input.routedIntent,
    predictedConfidence: input.predictedConfidence,
    predictedEntitiesCount: input.predictedEntitiesCount,
    sentiment: input.sentiment,
    responsePolicyVersion: RESPONSE_POLICY_VERSION,
    llmPath: llm?.llmPath ?? LLM_PATH_FALLBACK_DEFAULT,
    fallbackReason: llm?.fallbackReason ?? null,
    promptVersion: llm?.promptVersion ?? null,
    promptContextBudget: llm?.promptContextBudget ?? null,
    contextCharsBefore: llm?.contextCharsBefore ?? null,
    contextCharsAfter: llm?.contextCharsAfter ?? null,
    contextTruncationStrategy: llm?.contextTruncationStrategy ?? null,
    inputTokenCount: llm?.inputTokenCount ?? null,
    outputTokenCount: llm?.outputTokenCount ?? null,
    cachedTokenCount: llm?.cachedTokenCount ?? null,
    policyFactsIncluded: llm?.policyFactsIncluded ?? null,
    criticalPolicyIncluded: llm?.criticalPolicyIncluded ?? null,
    criticalPolicyTrimmed: llm?.criticalPolicyTrimmed ?? null,
    contextTypes: input.contextTypes,
    sessionId: input.conversationId,
    traceId: input.requestId,
    spanId: input.externalEventId.slice(0, 16),
    discloseExactStock: input.discloseExactStock,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    storeInfoSubtype: input.storeInfoSubtype,
    storeInfoPolicyVersion: input.storeInfoPolicyVersion,
    uiPayloadVersion: input.uiPayloadVersion,
    uiKind: input.uiKind,
    uiCardsCount: input.uiCardsCount,
    uiCardsWithImageCount: input.uiCardsWithImageCount,
    authPresent: input.authPresent,
    llmAttempts: input.llmAttempts,
    toolAttempts: input.toolAttempts,
    pipelineFallbackCount: input.pipelineFallbackCount,
    pipelineFallbackReasons: input.pipelineFallbackReasons,
    intentRescuedTo: input.intentRescuedTo,
    intentRescueReason: input.intentRescueReason,
    ordersDataSource: input.ordersDataSource ?? null,
    orderIdResolved: input.orderIdResolved ?? null,
    orderStateRaw: input.orderStateRaw ?? null,
    orderStateCanonical: input.orderStateCanonical ?? null,
    ordersStateConflict: input.ordersStateConflict,
    ordersDeterministicReply: input.ordersDeterministicReply,
    ...input.guestOrderFlowMetadata,
    ...input.recommendationsFlowMetadata,
    ...input.recommendationsMemoryMetadata,
    ...input.ordersEscalationFlowMetadata,
  };
}
