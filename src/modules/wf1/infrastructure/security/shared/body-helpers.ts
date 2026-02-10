/**
 * Request body parsing utilities.
 * Shared across security validation modules.
 */

/**
 * Resolves a request body to a record object.
 * Returns empty object if body is not a valid object.
 *
 * @param body - Request body to resolve
 * @returns Record object or empty object
 */
export function resolveBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}
