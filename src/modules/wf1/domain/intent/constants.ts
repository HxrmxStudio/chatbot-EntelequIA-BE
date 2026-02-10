import type { IntentName, IntentResult } from './types';

export const INTENT_NAMES: readonly IntentName[] = [
  'products',
  'orders',
  'tickets',
  'store_info',
  'payment_shipping',
  'recommendations',
  'general',
] as const;

export const FALLBACK_INTENT_RESULT: IntentResult = {
  intent: 'general',
  confidence: 0.55,
  entities: [],
};
