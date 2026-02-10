/**
 * Raw conversation history row shape (matches n8n Postgres node output).
 */
export interface ConversationHistoryRow {
  id: string | number;
  content: string | null;
  sender: string | null;
  type: string | null;
  channel: string | null;
  metadata: unknown;
  created_at: string | null;
}
