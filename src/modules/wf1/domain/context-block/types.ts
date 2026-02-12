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
  | 'static_context';

export interface ContextBlock {
  contextType: ContextType;
  contextPayload: Record<string, unknown>;
}

export interface MessageHistoryItem {
  sender: 'user' | 'bot' | 'agent' | 'system';
  content: string;
  createdAt: string;
}
