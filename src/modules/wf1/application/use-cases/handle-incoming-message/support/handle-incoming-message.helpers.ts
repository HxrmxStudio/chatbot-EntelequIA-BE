import type { LlmReplyMetadata } from '../../../ports/llm.port';
import type { ContextBlock } from '../../../../domain/context-block';
import type { ConversationHistoryRow } from '../../../../domain/conversation-history';
import { formatRecommendationCategoryLabel } from '../responses/recommendations/recommendations-disambiguation-response';
import {
  type RecommendationDisambiguationState,
  RECOMMENDATIONS_FLOW_CATEGORY_HINT_METADATA_KEY,
  RECOMMENDATIONS_FLOW_FRANCHISE_METADATA_KEY,
  RECOMMENDATIONS_FLOW_STATE_METADATA_KEY,
} from '../flows/recommendations/resolve-recommendations-flow-state';
import {
  type OrdersEscalationFlowState,
  ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY,
} from '../flows/orders/resolve-orders-escalation-flow-state';

export function normalizeLlmReply(
  input: string | { message: string; metadata?: LlmReplyMetadata },
): { message: string; metadata?: LlmReplyMetadata } {
  if (typeof input === 'string') {
    return { message: input };
  }

  return {
    message: input.message,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function resolveExactStockDisclosure(
  contextBlocks: Array<{ contextType: string; contextPayload: Record<string, unknown> }>,
): boolean {
  const products = contextBlocks.find((block) => block.contextType === 'products');
  if (!products) {
    return false;
  }

  return products.contextPayload['discloseExactStock'] === true;
}

export function resolveStoreInfoSubtype(
  contextBlocks?: Array<{ contextType: string; contextPayload: Record<string, unknown> }>,
): string | null {
  if (!Array.isArray(contextBlocks)) {
    return null;
  }

  const storeInfo = contextBlocks.find((block) => block.contextType === 'store_info');
  if (!storeInfo) {
    return null;
  }

  const infoRequested = storeInfo.contextPayload['infoRequested'];
  return typeof infoRequested === 'string' && infoRequested.length > 0
    ? infoRequested
    : null;
}

export function hasCatalogUiContext(contextBlocks: ContextBlock[]): boolean {
  return contextBlocks.some(
    (block) => block.contextType === 'products' || block.contextType === 'recommendations',
  );
}

export function shouldCountReturnsPolicyAnswer(
  contextBlocks: ContextBlock[],
  intent: string,
): boolean {
  if (intent !== 'tickets') {
    return false;
  }

  return contextBlocks.some(
    (block) =>
      block.contextType === 'tickets' && block.contextPayload['issueType'] === 'returns',
  );
}

export function isCatalogUiMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.['uiKind'] === 'catalog';
}

export function buildRecommendationsRewriteText(input: {
  franchise: string;
  categoryHint: string | null;
  volumeNumber: number | null;
  wantsLatest: boolean;
  wantsStart: boolean;
}): string {
  const franchise = input.franchise.replace(/_/g, ' ');
  const category = formatRecommendationCategoryLabel(input.categoryHint);

  if (input.volumeNumber) {
    return `recomendame ${category} de ${franchise} tomo ${input.volumeNumber}`;
  }

  if (input.wantsStart) {
    return `recomendame ${category} de ${franchise} desde el inicio`;
  }

  if (input.wantsLatest) {
    return `recomendame ${category} de ${franchise} ultimos lanzamientos`;
  }

  return `recomendame ${category} de ${franchise}`;
}

export function buildRecommendationsFlowMetadata(input: {
  state: RecommendationDisambiguationState | undefined;
  franchise: string | null | undefined;
  categoryHint: string | null | undefined;
}): Record<string, unknown> {
  if (
    input.state === undefined &&
    input.franchise === undefined &&
    input.categoryHint === undefined
  ) {
    return {};
  }

  return {
    [RECOMMENDATIONS_FLOW_STATE_METADATA_KEY]: input.state ?? null,
    [RECOMMENDATIONS_FLOW_FRANCHISE_METADATA_KEY]: input.franchise ?? null,
    [RECOMMENDATIONS_FLOW_CATEGORY_HINT_METADATA_KEY]: input.categoryHint ?? null,
  };
}

export function buildOrdersEscalationFlowMetadata(
  state: OrdersEscalationFlowState | undefined,
): Record<string, unknown> {
  if (state === undefined) {
    return {};
  }

  return {
    [ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY]: state,
  };
}

export function getContextStringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function getContextStringArrayField(
  payload: Record<string, unknown>,
  key: string,
): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
}

export function resolveLatestBotMessageFromHistory(
  historyRows: ConversationHistoryRow[],
): string | null {
  for (const row of historyRows) {
    if (row.sender !== 'bot') {
      continue;
    }

    if (typeof row.content === 'string' && row.content.trim().length > 0) {
      return row.content.trim();
    }
  }

  return null;
}
