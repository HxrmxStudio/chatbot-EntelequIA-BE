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

  let amount: number | null = null;
  if (typeof value.amount === 'number' && Number.isFinite(value.amount)) {
    amount = value.amount;
  } else if (typeof value.amount === 'string') {
    amount = parseLocalizedAmount(value.amount);
  }

  if (amount === null) {
    return undefined;
  }

  return { currency: currency.trim(), amount };
}

function parseLocalizedAmount(rawAmount: string): number | null {
  const trimmed = rawAmount.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const numericToken = trimmed.match(/-?\d[\d.,]*/)?.[0];
  if (!numericToken) {
    return null;
  }

  const normalized = normalizeNumberToken(numericToken);
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumberToken(token: string): string {
  const hasComma = token.includes(',');
  const hasDot = token.includes('.');

  if (hasComma && hasDot) {
    return normalizeMixedSeparatorNumber(token);
  }

  if (hasComma) {
    return normalizeSingleSeparatorNumber(token, ',');
  }

  if (hasDot) {
    return normalizeSingleSeparatorNumber(token, '.');
  }

  return token;
}

function normalizeMixedSeparatorNumber(token: string): string {
  const lastComma = token.lastIndexOf(',');
  const lastDot = token.lastIndexOf('.');

  if (lastComma > lastDot) {
    return token.replace(/\./g, '').replace(',', '.');
  }

  return token.replace(/,/g, '');
}

function normalizeSingleSeparatorNumber(
  token: string,
  separator: ',' | '.',
): string {
  const separatorCount = countOccurrences(token, separator);
  if (separatorCount > 1) {
    return token.replaceAll(separator, '');
  }

  const separatorIndex = token.indexOf(separator);
  if (separatorIndex < 0) {
    return token;
  }

  const fractionalLength = token.length - separatorIndex - 1;
  const looksLikeThousandsSeparator =
    fractionalLength === 3 && separatorIndex > 0;
  if (looksLikeThousandsSeparator) {
    return token.replace(separator, '');
  }

  if (separator === ',') {
    return token.replace(',', '.');
  }

  return token;
}

function countOccurrences(value: string, search: string): number {
  let total = 0;
  for (const char of value) {
    if (char === search) {
      total += 1;
    }
  }
  return total;
}
