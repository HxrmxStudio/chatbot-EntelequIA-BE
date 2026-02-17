import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { buildTicketsAiContext } from '@/modules/wf1/domain/tickets-context';
import { resolveTicketSignals } from '../query-resolvers';
import type { EnrichInput, EnrichDeps } from '../types';

export async function enrichTickets(
  input: EnrichInput,
  deps: EnrichDeps,
): Promise<ContextBlock[]> {
  const { promptTemplates } = deps;

  const ticketSignals = resolveTicketSignals({
    text: input.text,
    entities: input.intentResult.entities,
    sentiment: input.sentiment ?? 'neutral',
  });
  const aiContext = buildTicketsAiContext({
    signals: ticketSignals,
    templates: {
      header: promptTemplates.getTicketsContextHeader(),
      contactOptions: promptTemplates.getTicketsContactOptions(),
      highPriorityNote: promptTemplates.getTicketsHighPriorityNote(),
      returnsPolicy: promptTemplates.getTicketsReturnsPolicyContext(),
      instructions: promptTemplates.getTicketsContextInstructions(),
    },
  });

  return [
    {
      contextType: 'tickets',
      contextPayload: {
        issueType: aiContext.issueType,
        priority: aiContext.priority,
        sentiment: aiContext.sentiment,
        requiresHumanEscalation: aiContext.requiresHumanEscalation,
        aiContext: aiContext.contextText,
      },
    },
  ];
}
