import type { Sentiment } from '../output-validation';

export type TicketIssueType =
  | 'general'
  | 'order'
  | 'delivery'
  | 'payment'
  | 'returns'
  | 'product_condition';

export type TicketPriority = 'normal' | 'high';

export interface TicketSignals {
  issueType: TicketIssueType;
  priority: TicketPriority;
  sentiment: Sentiment;
  requiresHumanEscalation: boolean;
}

export interface TicketsTemplates {
  header: string;
  contactOptions: string;
  highPriorityNote: string;
  returnsPolicy: string;
  instructions: string;
}

export interface TicketsAiContext extends TicketSignals {
  contextText: string;
}
