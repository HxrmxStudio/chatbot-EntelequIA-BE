type ErrorConstructor = new (message: string) => Error;

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
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ErrorClass(message);
  }

  return input as Record<string, unknown>;
}
