import { isRecord } from '@/common/utils/object.utils';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';

export const ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY = 'ordersEscalationFlowState';

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
  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return 'unknown';
  }

  if (containsAnyTerm(normalized, STRONG_NO_TERMS)) {
    return 'no';
  }

  if (containsAnyTerm(normalized, STRONG_YES_TERMS)) {
    return 'yes';
  }

  if (containsAnyTerm(normalized, WEAK_YES_TERMS) && isShortAck(normalized)) {
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

export function shouldSuggestCancelledOrderEscalation(message: string): boolean {
  const normalized = normalizeText(message);
  if (normalized.length === 0) {
    return false;
  }

  const hasCancelSignal = normalized.includes('cancel');
  const hasReasonSignal = normalized.includes('motivo') || normalized.includes('razon');
  const hasConsultSignal =
    normalized.includes('queres que consulte') ||
    normalized.includes('queres que revis') ||
    normalized.includes('area correspondiente') ||
    normalized.includes('escal');

  return hasCancelSignal && hasReasonSignal && hasConsultSignal;
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
  const normalized = normalizeText(text);
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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAnyTerm(text: string, terms: readonly string[]): boolean {
  for (const term of terms) {
    const normalizedTerm = normalizeText(term);
    if (containsNormalizedTerm(text, normalizedTerm)) {
      return true;
    }
  }

  return false;
}

function containsNormalizedTerm(text: string, normalizedTerm: string): boolean {
  if (normalizedTerm.length === 0) {
    return false;
  }

  if (text === normalizedTerm) {
    return true;
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}
