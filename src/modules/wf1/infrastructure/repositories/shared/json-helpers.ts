/**
 * JSON utility functions for PostgreSQL jsonb columns.
 * Shared across repositories to avoid duplication (DRY principle).
 */

/**
 * Converts a value to a JSON string suitable for PostgreSQL jsonb columns.
 * Handles null/undefined by returning 'null' string.
 *
 * @param value - Value to convert to JSON string
 * @returns JSON string representation
 */
export function toJsonb(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  return JSON.stringify(value);
}
