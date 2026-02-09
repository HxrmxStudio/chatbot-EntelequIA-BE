export const INTENT_NAMES = [
  'products',
  'orders',
  'tickets',
  'store_info',
  'payment_shipping',
  'recommendations',
  'general',
] as const;

export type IntentName = (typeof INTENT_NAMES)[number];

export interface IntentResult {
  intent: IntentName;
  confidence: number;
  entities: string[];
}

export const FALLBACK_INTENT_RESULT: IntentResult = {
  intent: 'general',
  confidence: 0.55,
  entities: [],
};
