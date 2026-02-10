/**
 * Thrown when an external service (e.g. Entelequia API) fails.
 * Preserves status code and error classification for use-case error mapping.
 */
export class ExternalServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: 'network' | 'timeout' | 'http',
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}
