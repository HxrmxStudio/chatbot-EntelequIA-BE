import {
  DEFAULT_TICKETS_CONTACT_OPTIONS,
  DEFAULT_TICKETS_CONTEXT_HEADER,
  DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS,
  DEFAULT_TICKETS_HIGH_PRIORITY_NOTE,
  TICKET_ISSUE_LABELS,
  TICKET_PRIORITY_LABELS,
} from './constants';
import type { TicketsAiContext, TicketsTemplates, TicketSignals } from './types';

/**
 * Builds an AI-ready support context for tickets intent.
 */
export function buildTicketsAiContext(input: {
  signals: TicketSignals;
  templates?: Partial<TicketsTemplates>;
}): TicketsAiContext {
  const templates = resolveTemplates(input.templates);
  const issueLabel = TICKET_ISSUE_LABELS[input.signals.issueType];
  const priorityLabel = TICKET_PRIORITY_LABELS[input.signals.priority];

  const lines: string[] = [
    templates.header,
    '',
    'Entiendo que tuviste un inconveniente. Te ayudo a derivarlo correctamente.',
    `- Tipo detectado: ${issueLabel}`,
    `- Prioridad: ${priorityLabel}`,
    '',
    templates.contactOptions,
  ];

  if (input.signals.requiresHumanEscalation) {
    lines.push('', templates.highPriorityNote);
  }

  lines.push('', templates.instructions);

  return {
    ...input.signals,
    contextText: lines.join('\n'),
  };
}

function resolveTemplates(partial?: Partial<TicketsTemplates>): TicketsTemplates {
  return {
    header: partial?.header ?? DEFAULT_TICKETS_CONTEXT_HEADER,
    contactOptions: partial?.contactOptions ?? DEFAULT_TICKETS_CONTACT_OPTIONS,
    highPriorityNote:
      partial?.highPriorityNote ?? DEFAULT_TICKETS_HIGH_PRIORITY_NOTE,
    instructions:
      partial?.instructions ?? DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS,
  };
}
