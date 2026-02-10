/**
 * Resolves a value to an optional non-empty string.
 * Returns undefined if value is not a string or is empty after trim.
 */
export function resolveOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
