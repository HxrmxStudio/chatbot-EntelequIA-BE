import type { ContextBlock, MessageHistoryItem } from '../../domain/context-block';
import type { IntentName } from '../../domain/intent';

export interface LlmPort {
  buildAssistantReply(input: {
    userText: string;
    intent: IntentName;
    history: MessageHistoryItem[];
    contextBlocks: ContextBlock[];
  }): Promise<string>;
}
