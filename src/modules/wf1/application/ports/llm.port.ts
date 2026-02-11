import type { ContextBlock, MessageHistoryItem } from '../../domain/context-block';
import type { IntentName } from '../../domain/intent';

export interface LlmReplyMetadata {
  llmPath: 'structured_success' | 'legacy_success' | 'fallback_intent' | 'fallback_default';
  fallbackReason?: string;
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  cachedTokenCount?: number | null;
  promptVersion?: string;
}

export interface LlmReplyResult {
  message: string;
  metadata?: LlmReplyMetadata;
}

export interface LlmPort {
  buildAssistantReply(input: {
    requestId: string;
    conversationId: string;
    externalEventId: string;
    userText: string;
    intent: IntentName;
    history: MessageHistoryItem[];
    contextBlocks: ContextBlock[];
  }): Promise<string | LlmReplyResult>;
}
