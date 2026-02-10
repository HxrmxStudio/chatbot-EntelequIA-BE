/**
 * Date utility functions.
 * Shared across the codebase to avoid duplication (DRY principle).
 */

/**
 * Coerces a value to an ISO timestamp string.
 * Handles Date objects, strings, and other types.
 *
 * @param value - Value to coerce (Date, string, or other)
 * @returns ISO timestamp string
 */
export function coerceTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}
