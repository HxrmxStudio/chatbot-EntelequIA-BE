import { isRecord } from '@/common/utils/object.utils';
import type { Money } from './types';

/**
 * Parses a Money value from unknown input.
 * Handles both strict number validation and coercion via coerceNumber.
 * Returns undefined if the value cannot be parsed as valid Money.
 *
 * @param value - Value to parse (object with currency and amount)
 * @returns Money object or undefined if invalid
 */
export function parseMoney(value: unknown): Money | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const currency = typeof value.currency === 'string' ? value.currency : undefined;
  if (!currency || currency.trim().length === 0) {
    return undefined;
  }

  // Support both strict number validation and coercion
  let amount: number | null = null;
  if (typeof value.amount === 'number' && Number.isFinite(value.amount)) {
    amount = value.amount;
  } else if (typeof value.amount === 'string') {
    const parsed = Number(value.amount);
    if (Number.isFinite(parsed)) {
      amount = parsed;
    }
  }

  if (amount === null) {
    return undefined;
  }

  return { currency: currency.trim(), amount };
}
