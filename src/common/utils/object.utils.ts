type ErrorConstructor = new (message: string) => Error;

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/**
 * Ensures the input is a plain object (not null, neither an array).
 * Throws with the given message if validation fails.
 * Use ErrorClass to throw a custom error type (e.g. IntentValidationError).
 */
export function ensureObject(
  input: unknown,
  message = 'Invalid payload: input must be an object',
  ErrorClass: ErrorConstructor = Error,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new ErrorClass(message);
  }

  return input as Record<string, unknown>;
}
