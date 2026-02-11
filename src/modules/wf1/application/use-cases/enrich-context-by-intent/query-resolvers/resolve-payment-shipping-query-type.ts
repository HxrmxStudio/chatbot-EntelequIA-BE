import type { PaymentShippingQueryType } from '@/modules/wf1/domain/payment-shipping-context';
import { normalizeForToken } from './normalize';
import {
  PAYMENT_SHIPPING_COST_QUERY_PATTERN,
  PAYMENT_SHIPPING_PAYMENT_QUERY_PATTERN,
  PAYMENT_SHIPPING_SHIPPING_QUERY_PATTERN,
  PAYMENT_SHIPPING_TIME_QUERY_PATTERN,
} from './patterns';

/**
 * Resolves payment/shipping query subtype using deterministic heuristics.
 * Priority: cost > time > payment > shipping > general.
 *
 * @param text - Raw user text
 * @returns Query subtype used to format context for payment_shipping intent
 */
export function resolvePaymentShippingQueryType(text: string): PaymentShippingQueryType {
  const normalized = normalizeForToken(text);

  if (normalized.length === 0) {
    return 'general';
  }

  if (PAYMENT_SHIPPING_COST_QUERY_PATTERN.test(normalized)) {
    return 'cost';
  }

  if (PAYMENT_SHIPPING_TIME_QUERY_PATTERN.test(normalized)) {
    return 'time';
  }

  if (PAYMENT_SHIPPING_PAYMENT_QUERY_PATTERN.test(normalized)) {
    return 'payment';
  }

  if (PAYMENT_SHIPPING_SHIPPING_QUERY_PATTERN.test(normalized)) {
    return 'shipping';
  }

  return 'general';
}
