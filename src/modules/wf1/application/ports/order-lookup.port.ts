/**
 * Port for guest order lookup functionality.
 * 
 * Provides signed, rate-limited order lookup for guest users
 * using identity verification factors (DNI, phone, name, lastName).
 */

import type { Money } from '@/modules/wf1/domain/money';

export interface OrderLookupIdentityInput {
  dni?: string;
  name?: string;
  lastName?: string;
  phone?: string;
}

export interface OrderLookupOrderSummary {
  id: string | number;
  state: string;
  createdAt?: string;
  updatedAt?: string;
  total?: Money;
  paymentMethod?: string;
  shipMethod?: string;
  trackingCode?: string;
}

export interface OrderLookupSuccessResult {
  ok: true;
  order: OrderLookupOrderSummary;
}

export interface OrderLookupFailureResult {
  ok: false;
  code: 'unauthorized' | 'invalid_payload' | 'not_found_or_mismatch' | 'throttled';
  statusCode: 401 | 404 | 422 | 429;
}

export type OrderLookupResult = OrderLookupSuccessResult | OrderLookupFailureResult;

export interface OrderLookupPort {
  lookupOrder(input: {
    requestId: string;
    orderId: number;
    identity: OrderLookupIdentityInput;
  }): Promise<OrderLookupResult>;
}
