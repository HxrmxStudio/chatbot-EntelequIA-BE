export type ExternalServiceEndpointGroup = 'catalog' | 'orders' | 'stock' | 'unknown';

export interface ExternalServiceErrorContext {
  service: 'entelequia';
  endpointGroup: ExternalServiceEndpointGroup;
  endpointPath: string;
}

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
    public readonly context?: ExternalServiceErrorContext,
  ) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}
