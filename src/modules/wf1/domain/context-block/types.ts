export type ContextType =
  | 'products'
  | 'product_detail'
  | 'orders'
  | 'order_detail'
  | 'payment_info'
  | 'tickets'
  | 'recommendations'
  | 'catalog_taxonomy'
  | 'store_info'
  | 'general'
  | 'policy_facts'
  | 'static_context'
  | 'critical_policy'
  | 'instruction_hint';

export interface ContextBlock {
  contextType: ContextType;
  contextPayload: Record<string, unknown>;
}

export interface MessageHistoryItem {
  sender: 'user' | 'bot' | 'agent' | 'system';
  content: string;
  createdAt: string;
}
