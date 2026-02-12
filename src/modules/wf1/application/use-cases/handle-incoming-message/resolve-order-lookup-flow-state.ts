import { isRecord } from '@/common/utils/object.utils';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import type { ResolvedOrderLookupRequest } from './resolve-order-lookup-request';
import { resolveOrderLookupRequest } from './resolve-order-lookup-request';

export const ORDERS_GUEST_FLOW_STATE_METADATA_KEY = 'ordersGuestFlowState';

export type GuestOrderFlowState =
  | 'awaiting_has_data_answer'
  | 'awaiting_lookup_payload'
  | null;

export type HasOrderDataAnswer = 'yes' | 'no' | 'unknown';
export type OrderDataAnswerStrength =
  | 'strong_yes'
  | 'weak_yes'
  | 'strong_no'
  | 'ambiguous'
  | 'unknown';

const STRONG_YES_TERMS = [
  'si',
  'sii',
  'yes',
  'tengo',
  'los tengo',
  'cuento con',
  'dispongo',
  'claro',
  'de una',
] as const;
const WEAK_YES_TERMS = [
  'dale',
  'ok',
  'okey',
  'listo',
  'joya',
  'perfecto',
  'genial',
  'buenisimo',
  'buenisima',
] as const;
const STRONG_NO_TERMS = [
  'no',
  'noo',
  'nop',
  'negativo',
  'no tengo',
  'no cuento',
  'no dispongo',
  'todavia no',
  'aun no',
  'ni en pedo',
  'no estoy ni ahi',
  'ni ahi',
] as const;
const AMBIGUOUS_TERMS = [
  'no se',
  'nose',
  'quizas',
  'tal vez',
  'capaz',
  'puede ser',
  'puede que',
] as const;
const SHORT_ISOLATED_ACK_TERMS = new Set([
  'si',
  'sii',
  'yes',
  'claro',
  'de una',
  'dale',
  'ok',
  'okey',
  'listo',
  'joya',
  'perfecto',
  'genial',
  'buenisimo',
  'buenisima',
]);
const MAX_SHORT_ACK_WORDS = 3;

export function resolveGuestOrderFlowStateFromHistory(
  historyRows: ConversationHistoryRow[],
): GuestOrderFlowState {
  for (const row of historyRows) {
    if (row.sender !== 'bot') {
      continue;
    }

    const resolvedState = parseFlowStateFromMetadata(row.metadata);
    if (resolvedState !== undefined) {
      return resolvedState;
    }
  }

  return null;
}

export function resolveHasOrderDataAnswer(text: string): HasOrderDataAnswer {
  const strength = resolveOrderDataAnswerStrength(text);

  if (strength === 'strong_no') {
    return 'no';
  }

  if (strength === 'strong_yes') {
    return 'yes';
  }

  if (strength === 'weak_yes' && isShortIsolatedOrderAck(text)) {
    return 'yes';
  }

  return 'unknown';
}

export function resolveOrderDataAnswerStrength(text: string): OrderDataAnswerStrength {
  const normalizedText = normalizeLookupText(text);
  if (normalizedText.length === 0) {
    return 'unknown';
  }

  if (containsAnyTerm(normalizedText, AMBIGUOUS_TERMS)) {
    return 'ambiguous';
  }

  if (containsAnyTerm(normalizedText, STRONG_NO_TERMS)) {
    return 'strong_no';
  }

  if (containsAnyTerm(normalizedText, STRONG_YES_TERMS)) {
    return 'strong_yes';
  }

  if (containsAnyTerm(normalizedText, WEAK_YES_TERMS)) {
    return 'weak_yes';
  }

  return 'unknown';
}

export function isShortIsolatedOrderAck(text: string): boolean {
  const normalizedText = normalizeLookupText(text);
  if (normalizedText.length === 0) {
    return false;
  }

  const wordCount = normalizedText.split(' ').filter((word) => word.length > 0).length;
  if (wordCount > MAX_SHORT_ACK_WORDS) {
    return false;
  }

  return SHORT_ISOLATED_ACK_TERMS.has(normalizedText);
}

export function shouldContinueGuestOrderLookupFlow(input: {
  currentFlowState: GuestOrderFlowState;
  text: string;
  entities: string[];
  routedIntent: string;
}): boolean {
  if (input.currentFlowState === null) {
    return false;
  }

  const resolvedRequest = resolveOrderLookupRequest({
    text: input.text,
    entities: input.entities,
  });
  const hasLookupSignals = hasOrderLookupSignals(resolvedRequest);
  if (hasLookupSignals) {
    return true;
  }

  const answer = resolveHasOrderDataAnswer(input.text);
  if (answer === 'no') {
    return true;
  }

  if (input.currentFlowState === 'awaiting_lookup_payload') {
    if (answer === 'yes') {
      return input.routedIntent === 'orders' && isShortIsolatedOrderAck(input.text);
    }

    return input.routedIntent === 'orders';
  }

  if (answer === 'yes') {
    if (input.routedIntent !== 'orders' && !isShortIsolatedOrderAck(input.text)) {
      return false;
    }

    return true;
  }

  if (input.routedIntent === 'orders') {
    return true;
  }

  return false;
}

export function hasOrderLookupSignals(input: ResolvedOrderLookupRequest): boolean {
  return Boolean(input.orderId) || input.providedFactors > 0 || input.invalidFactors.length > 0;
}

function parseFlowStateFromMetadata(metadata: unknown): GuestOrderFlowState | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }

  if (!(ORDERS_GUEST_FLOW_STATE_METADATA_KEY in metadata)) {
    return undefined;
  }

  const value = metadata[ORDERS_GUEST_FLOW_STATE_METADATA_KEY];
  if (value === null) {
    return null;
  }

  if (value === 'awaiting_has_data_answer' || value === 'awaiting_lookup_payload') {
    return value;
  }

  return null;
}

function normalizeLookupText(value: string): string {
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
    if (containsNormalizedTerm(text, term)) {
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
