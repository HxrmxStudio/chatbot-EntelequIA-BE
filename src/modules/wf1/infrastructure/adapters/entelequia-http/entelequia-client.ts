import { ExternalServiceError } from '../../../domain/errors';
import { fetchWithTimeout } from '../shared';
import { parseJson } from './product-helpers';

export async function fetchEntelequiaJson(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}${path}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(headers ?? {}),
        },
      },
      timeoutMs,
    );

    const body = await parseJson(response);

    if (!response.ok) {
      throw new ExternalServiceError(
        `Entelequia backend error ${response.status}`,
        response.status,
        'http',
        body,
      );
    }

    if (typeof body !== 'object' || body === null) {
      return { data: body };
    }

    return body as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExternalServiceError('Entelequia request timeout', 0, 'timeout');
    }

    throw new ExternalServiceError('Entelequia network error', 0, 'network');
  }
}
