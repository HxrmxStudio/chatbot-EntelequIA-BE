import type { Money } from './types';

/**
 * Formats a Money value as a human-readable string.
 * Format: "$amount currency"
 *
 * @param money - Money object to format
 * @returns Formatted string (e.g., "$2500 ARS")
 */
export function formatMoney(money: Money): string {
  return `$${money.amount} ${money.currency}`.trim();
}
