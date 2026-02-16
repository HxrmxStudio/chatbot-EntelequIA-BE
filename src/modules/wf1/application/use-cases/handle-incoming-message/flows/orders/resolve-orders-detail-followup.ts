import { normalizeTextForSearch } from '@/common/utils/text-normalize.utils';
import { isRecord } from '@/common/utils/object.utils';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';

const ORDER_ITEMS_REQUEST_PATTERNS: readonly RegExp[] = [
  /\bque\s+(tenia|traia|trae|incluye)\b/i,
  /\bque\s+productos?\s+tenia\b/i,
  /\bproductos?\s+del\s+pedido\b/i,
  /\bdetalle\s+del\s+pedido\b/i,
];

const PLURAL_ORDERS_PATTERNS: readonly RegExp[] = [
  /\bmis\s+pedidos\b/i,
  /\btodos\s+mis\s+pedidos\b/i,
  /\bultimos?\s+pedidos\b/i,
  /\blistad[oa]\s+de\s+pedidos\b/i,
  /\bpedidos\b/i,
];

const SINGULAR_ORDER_FOLLOWUP_PATTERNS: readonly RegExp[] = [
  /\b(ese|este|el|mi)\s+pedido\b/i,
  /\bestado\s+de\s+(ese|este|el|mi)\s+pedido\b/i,
  /\bpedido\b/i,
];

export interface ResolveOrdersDetailFollowupInput {
  text: string;
  historyRows: ConversationHistoryRow[];
  explicitOrderId?: string | null;
}

export interface OrdersDetailFollowupResolution {
  includeOrderItems: boolean;
  resolvedOrderId: string | null;
  resolvedFromHistory: boolean;
}

export function resolveOrdersDetailFollowup(
  input: ResolveOrdersDetailFollowupInput,
): OrdersDetailFollowupResolution {
  const normalizedText = normalizeTextForSearch(input.text);
  const includeOrderItems = matchesAnyPattern(normalizedText, ORDER_ITEMS_REQUEST_PATTERNS);
  const explicitOrderId = normalizeOrderId(input.explicitOrderId ?? null);

  if (explicitOrderId) {
    return {
      includeOrderItems,
      resolvedOrderId: explicitOrderId,
      resolvedFromHistory: false,
    };
  }

  if (matchesAnyPattern(normalizedText, PLURAL_ORDERS_PATTERNS)) {
    return {
      includeOrderItems,
      resolvedOrderId: null,
      resolvedFromHistory: false,
    };
  }

  if (!shouldReuseOrderId(normalizedText, includeOrderItems)) {
    return {
      includeOrderItems,
      resolvedOrderId: null,
      resolvedFromHistory: false,
    };
  }

  const orderIdFromHistory = resolveLatestOrderIdFromHistory(input.historyRows);
  return {
    includeOrderItems,
    resolvedOrderId: orderIdFromHistory,
    resolvedFromHistory: orderIdFromHistory !== null,
  };
}

function shouldReuseOrderId(text: string, includeOrderItems: boolean): boolean {
  if (includeOrderItems) {
    return true;
  }

  return matchesAnyPattern(text, SINGULAR_ORDER_FOLLOWUP_PATTERNS);
}

function resolveLatestOrderIdFromHistory(historyRows: ConversationHistoryRow[]): string | null {
  for (const row of historyRows) {
    if (row.sender !== 'bot' || !isRecord(row.metadata) || !isOrdersTurnMetadata(row.metadata)) {
      continue;
    }

    const orderIdResolved = normalizeOrderId(row.metadata['orderIdResolved']);
    if (orderIdResolved) {
      return orderIdResolved;
    }
  }

  return null;
}

function isOrdersTurnMetadata(metadata: Record<string, unknown>): boolean {
  if (metadata['ordersDeterministicReply'] === true) {
    return true;
  }

  return metadata['intent'] === 'orders' || metadata['predictedIntent'] === 'orders';
}

function matchesAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

function normalizeOrderId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
