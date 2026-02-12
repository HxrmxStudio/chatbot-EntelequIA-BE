import {
  ExternalServiceError,
  type ExternalServiceErrorContext,
} from '@/modules/wf1/domain/errors';
import { fetchWithTimeout } from '../shared';
import { parseJson } from './product-helpers';

export async function fetchEntelequiaJson(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const context = resolveExternalServiceErrorContext(path);

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
        context,
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
      throw new ExternalServiceError('Entelequia request timeout', 0, 'timeout', undefined, context);
    }

    throw new ExternalServiceError('Entelequia network error', 0, 'network', undefined, context);
  }
}

function resolveExternalServiceErrorContext(path: string): ExternalServiceErrorContext {
  const pathWithoutQuery = path.split('?')[0] ?? '';
  const normalizedPath = pathWithoutQuery.trim();

  return {
    service: 'entelequia',
    endpointGroup: resolveEndpointGroup(normalizedPath),
    endpointPath: normalizedPath.length > 0 ? normalizedPath : '/',
  };
}

function resolveEndpointGroup(pathWithoutQuery: string): ExternalServiceErrorContext['endpointGroup'] {
  if (
    pathWithoutQuery.startsWith('/products-list') ||
    pathWithoutQuery.startsWith('/products/recommended') ||
    pathWithoutQuery.startsWith('/products/brands') ||
    pathWithoutQuery.startsWith('/products/authors') ||
    pathWithoutQuery.startsWith('/products/latest') ||
    pathWithoutQuery.startsWith('/product/')
  ) {
    return 'catalog';
  }

  if (pathWithoutQuery.startsWith('/account/orders')) {
    return 'orders';
  }

  return 'unknown';
}
