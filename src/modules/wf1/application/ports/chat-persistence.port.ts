import type { MessageHistoryItem } from '../../domain/context-block';
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

export interface ChatPersistencePort {
  upsertUser(userId: string): Promise<UserContext>;
  upsertConversation(input: { conversationId: string; userId: string; channel: ChannelSource }): Promise<void>;
  getConversationHistory(input: { conversationId: string; limit: number }): Promise<MessageHistoryItem[]>;
  getLastBotMessageByExternalEvent(input: {
    channel: ChannelSource;
    externalEventId: string;
    conversationId?: string;
  }): Promise<string | null>;
  persistTurn(input: PersistTurnInput): Promise<void>;
}
