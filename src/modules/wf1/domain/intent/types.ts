export type IntentName =
  | 'products'
  | 'orders'
  | 'tickets'
  | 'store_info'
  | 'payment_shipping'
  | 'recommendations'
  | 'general';

export interface IntentResult {
  intent: IntentName;
  confidence: number;
  entities: string[];
}
