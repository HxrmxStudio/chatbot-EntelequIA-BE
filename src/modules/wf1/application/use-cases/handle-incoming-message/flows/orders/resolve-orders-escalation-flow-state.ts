import {
  containsAnyTerm,
  normalizeTextWithRepeatedCharRemoval,
} from '@/common/utils/text-normalize.utils';
import { isRecord } from '@/common/utils/object.utils';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';

export const ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY = 'ordersEscalationFlowState';
export const OFFERED_ESCALATION_METADATA_KEY = 'offeredEscalation';

export type OrdersEscalationFlowState = 'awaiting_cancelled_reason_confirmation' | null;
export type CancelledOrderEscalationAnswer = 'yes' | 'no' | 'unknown';

const ORDER_ID_PATTERN = /\bpedido\s*#?\s*(\d{4,12})\b/i;
const CANCELLED_PATTERN = /\bcancelad[oa]\b/i;
const MAX_SHORT_ACK_WORDS = 4;

const STRONG_YES_TERMS = [
  'si',
  'sii',
  'yes',
  'de una',
  'obvio',
  'claro',
] as const;

const WEAK_YES_TERMS = [
  'dale',
  'ok',
  'okey',
  'listo',
  'joya',
  'perfecto',
  'por favor',
  'porfa',
  'si por favor',
  'si porfa',
] as const;

const STRONG_NO_TERMS = [
  'no',
  'noo',
  'nop',
  'no gracias',
  'no hace falta',
  'dejalo asi',
  'dejalo',
  'prefiero no',
] as const;

export function resolveOrdersEscalationFlowStateFromHistory(
  historyRows: ConversationHistoryRow[],
): OrdersEscalationFlowState {
  for (const row of historyRows) {
    if (row.sender !== 'bot') {
      continue;
    }

    const parsed = parseFlowStateFromMetadata(row.metadata);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return null;
}

export function shouldContinueOrdersEscalationFlow(input: {
  currentFlowState: OrdersEscalationFlowState;
  text: string;
  routedIntent: string;
}): boolean {
  if (input.currentFlowState === null) {
    return false;
  }

  const answer = resolveCancelledOrderEscalationAnswer(input.text);
  if (answer !== 'unknown') {
    return true;
  }

  if (input.routedIntent !== 'orders' && input.routedIntent !== 'tickets' && input.routedIntent !== 'general') {
    return false;
  }

  return containsEscalationIntent(input.text);
}

export function resolveCancelledOrderEscalationAnswer(
  text: string,
): CancelledOrderEscalationAnswer {
  const normalized = normalizeTextWithRepeatedCharRemoval(text);
  if (normalized.length === 0) {
    return 'unknown';
  }

  if (containsAnyTerm(normalized, STRONG_NO_TERMS, normalizeTextWithRepeatedCharRemoval)) {
    return 'no';
  }

  if (containsAnyTerm(normalized, STRONG_YES_TERMS, normalizeTextWithRepeatedCharRemoval)) {
    return 'yes';
  }

  if (
    containsAnyTerm(normalized, WEAK_YES_TERMS, normalizeTextWithRepeatedCharRemoval) &&
    isShortAck(normalized)
  ) {
    return 'yes';
  }

  return 'unknown';
}

export function resolveRecentCancelledOrderId(
  historyRows: ConversationHistoryRow[],
): string | null {
  for (const row of historyRows) {
    if (row.sender !== 'bot' || typeof row.content !== 'string') {
      continue;
    }

    if (!CANCELLED_PATTERN.test(row.content)) {
      continue;
    }

    const match = row.content.match(ORDER_ID_PATTERN);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if escalation was offered by examining metadata flag.
 * Replaces substring checking on bot message.
 */
export function shouldSuggestCancelledOrderEscalationFromMetadata(
  metadata: unknown,
): boolean {
  if (!isRecord(metadata)) {
    return false;
  }

  return metadata[OFFERED_ESCALATION_METADATA_KEY] === true;
}

function parseFlowStateFromMetadata(metadata: unknown): OrdersEscalationFlowState | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }

  if (!(ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY in metadata)) {
    return undefined;
  }

  const value = metadata[ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY];
  if (value === 'awaiting_cancelled_reason_confirmation' || value === null) {
    return value;
  }

  return null;
}

function containsEscalationIntent(text: string): boolean {
  const normalized = normalizeTextWithRepeatedCharRemoval(text);
  return (
    normalized.includes('consult') ||
    normalized.includes('escal') ||
    normalized.includes('deriv') ||
    normalized.includes('revis')
  );
}

function isShortAck(text: string): boolean {
  const words = text.split(' ').filter((word) => word.length > 0);
  return words.length <= MAX_SHORT_ACK_WORDS;
}

