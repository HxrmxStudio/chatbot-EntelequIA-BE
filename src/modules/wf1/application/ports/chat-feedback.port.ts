import type { ChannelSource } from '../../domain/source';

export type FeedbackRating = 'up' | 'down';
export type FeedbackCategory = 'accuracy' | 'relevance' | 'tone' | 'ux' | 'other';

export interface PersistChatFeedbackInput {
  source: ChannelSource;
  conversationId: string;
  responseId: string;
  userId?: string;
  rating: FeedbackRating;
  reason?: string;
  category?: FeedbackCategory;
  externalEventId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export interface PersistChatFeedbackResult {
  created: boolean;
}

export interface ChatFeedbackPort {
  persistFeedback(input: PersistChatFeedbackInput): Promise<PersistChatFeedbackResult>;
}
