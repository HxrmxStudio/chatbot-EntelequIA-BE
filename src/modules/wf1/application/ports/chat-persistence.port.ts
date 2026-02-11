import type { MessageHistoryItem } from '../../domain/context-block';
import type { ConversationHistoryRow } from '../../domain/conversation-history';
import type { ChannelSource } from '../../domain/source';
import type { UserContext } from '../../domain/user';

export interface PersistTurnInput {
  conversationId: string;
  userId: string;
  source: ChannelSource;
  externalEventId: string;
  userMessage: string;
  botMessage: string;
  intent: string;
  metadata?: Record<string, unknown>;
}

export interface AuthenticatedUserProfileInput {
  id: string;
  email: string;
  phone: string;
  name: string;
}

export interface ChatPersistencePort {
  upsertUser(userId: string): Promise<UserContext>;
  upsertAuthenticatedUserProfile(input: AuthenticatedUserProfileInput): Promise<UserContext>;
  upsertConversation(input: { conversationId: string; userId: string; channel: ChannelSource }): Promise<void>;
  getConversationHistory(input: { conversationId: string; limit: number }): Promise<MessageHistoryItem[]>;
  getConversationHistoryRows(input: { conversationId: string; limit: number }): Promise<ConversationHistoryRow[]>;
  getLastBotMessageByExternalEvent(input: {
    channel: ChannelSource;
    externalEventId: string;
    conversationId?: string;
  }): Promise<string | null>;
  persistTurn(input: PersistTurnInput): Promise<void>;
}
