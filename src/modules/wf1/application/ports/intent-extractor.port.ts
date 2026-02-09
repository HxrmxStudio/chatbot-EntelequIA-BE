import type { IntentResult } from '../../domain/intent';

export interface IntentExtractorPort {
  extractIntent(input: {
    text: string;
    requestId?: string;
    source?: string;
    userId?: string;
    conversationId?: string;
  }): Promise<IntentResult>;
}
