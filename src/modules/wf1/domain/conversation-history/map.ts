import type { MessageHistoryItem } from '../context-block';
import type { ConversationHistoryRow } from './types';

export function mapConversationHistoryRowsToMessageHistoryItems(
  rows: ConversationHistoryRow[],
): MessageHistoryItem[] {
  // DB query returns newest-first; LLM/prompting is clearer oldest-first.
  return [...rows].reverse().flatMap((row) => {
    if (typeof row.sender !== 'string') {
      return [];
    }
    if (
      row.sender !== 'user' &&
      row.sender !== 'bot' &&
      row.sender !== 'agent' &&
      row.sender !== 'system'
    ) {
      return [];
    }
    if (typeof row.content !== 'string') {
      return [];
    }
    if (typeof row.created_at !== 'string') {
      return [];
    }

    return [
      {
        sender: row.sender,
        content: row.content,
        createdAt: row.created_at,
      },
    ];
  });
}
