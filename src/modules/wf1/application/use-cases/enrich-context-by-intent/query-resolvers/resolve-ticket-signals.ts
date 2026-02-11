import type { Sentiment } from '@/modules/wf1/domain/output-validation';
import type { TicketIssueType, TicketSignals } from '@/modules/wf1/domain/tickets-context';
import { normalizeForToken } from './normalize';
import {
  TICKET_HIGH_PRIORITY_PATTERN,
  TICKET_ISSUE_DELIVERY_PATTERN,
  TICKET_ISSUE_ORDER_PATTERN,
  TICKET_ISSUE_PAYMENT_PATTERN,
  TICKET_ISSUE_PRODUCT_CONDITION_PATTERN,
  TICKET_ISSUE_RETURNS_PATTERN,
  TICKET_SEVERE_COMPLAINT_PATTERN,
} from './patterns';

/**
 * Resolves issue type and escalation priority for tickets intent.
 */
export function resolveTicketSignals(input: {
  text: string;
  entities: string[];
  sentiment: Sentiment;
}): TicketSignals {
  const normalizedText = buildNormalizedSignalText(input.text, input.entities);
  const issueType = resolveIssueType(normalizedText);

  const hasUrgencySignal = TICKET_HIGH_PRIORITY_PATTERN.test(normalizedText);
  const hasSevereComplaint = TICKET_SEVERE_COMPLAINT_PATTERN.test(normalizedText);
  const priority: TicketSignals['priority'] =
    hasUrgencySignal || (input.sentiment === 'negative' && hasSevereComplaint)
      ? 'high'
      : 'normal';

  return {
    issueType,
    priority,
    sentiment: input.sentiment,
    requiresHumanEscalation:
      priority === 'high' || input.sentiment === 'negative',
  };
}

function buildNormalizedSignalText(text: string, entities: string[]): string {
  const candidates = [text, ...entities]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizeForToken(value))
    .filter((value) => value.length > 0);

  return candidates.join(' ');
}

function resolveIssueType(normalizedText: string): TicketIssueType {
  if (normalizedText.length === 0) {
    return 'general';
  }

  if (TICKET_ISSUE_PRODUCT_CONDITION_PATTERN.test(normalizedText)) {
    return 'product_condition';
  }

  if (TICKET_ISSUE_RETURNS_PATTERN.test(normalizedText)) {
    return 'returns';
  }

  if (TICKET_ISSUE_PAYMENT_PATTERN.test(normalizedText)) {
    return 'payment';
  }

  if (TICKET_ISSUE_DELIVERY_PATTERN.test(normalizedText)) {
    return 'delivery';
  }

  if (TICKET_ISSUE_ORDER_PATTERN.test(normalizedText)) {
    return 'order';
  }

  return 'general';
}
