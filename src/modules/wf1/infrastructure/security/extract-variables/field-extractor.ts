/**
 * Helper function to convert values to Node.js string format (string | null).
 * Used for extracting variables from validation output.
 */
export function toNodeStringValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}
