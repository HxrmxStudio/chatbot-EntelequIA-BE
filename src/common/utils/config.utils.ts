/**
 * Resolves a config value to a boolean.
 * Accepts boolean, string (true/false/1/0/yes/no, case-insensitive), or undefined.
 * Returns fallback when value is undefined or not a recognized string.
 */
export function resolveBooleanFlag(
  value: string | boolean | undefined,
  fallback: boolean,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
}
