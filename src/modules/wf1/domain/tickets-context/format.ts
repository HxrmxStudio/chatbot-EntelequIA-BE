import { TICKET_ISSUE_LABELS, TICKET_PRIORITY_LABELS } from './constants';
import type { TicketsAiContext, TicketsTemplates, TicketSignals } from './types';

/**
 * Builds an AI-ready support context for tickets intent.
 * 
 * @param input.templates - REQUIRED. Templates must be provided by the adapter (no fallbacks).
 */
export function buildTicketsAiContext(input: {
  signals: TicketSignals;
  templates: TicketsTemplates;
}): TicketsAiContext {
  const issueLabel = TICKET_ISSUE_LABELS[input.signals.issueType];
  const priorityLabel = TICKET_PRIORITY_LABELS[input.signals.priority];
  const isReturnsIssue = input.signals.issueType === 'returns';

  const lines: string[] = [input.templates.header, ''];

  if (isReturnsIssue) {
    lines.push(
      'Te comparto primero la politica de devoluciones y cambios para resolver esto rapido.',
      input.templates.returnsPolicy,
      '',
      'Si queres, despues te indico el canal oficial para iniciar la gestion.',
      input.templates.contactOptions,
    );
  } else {
    lines.push(
      'Entiendo que tuviste un inconveniente. Te ayudo a derivarlo correctamente.',
      `- Tipo detectado: ${issueLabel}`,
      `- Prioridad: ${priorityLabel}`,
      '',
      input.templates.contactOptions,
    );
  }

  if (input.signals.requiresHumanEscalation) {
    lines.push('', input.templates.highPriorityNote);
  }

  lines.push('', input.templates.instructions);

  return {
    ...input.signals,
    contextText: lines.join('\n'),
  };
}

