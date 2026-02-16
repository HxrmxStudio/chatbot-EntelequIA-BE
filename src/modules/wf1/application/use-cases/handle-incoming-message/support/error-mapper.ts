import { ExternalServiceError, MissingAuthForOrdersError } from '../../../../domain/errors';
import type { Wf1Response } from '../../../../domain/wf1-response';
import {
  buildOrdersRequiresAuthResponse,
  buildOrdersSessionExpiredResponse,
} from '../responses/orders/orders-unauthenticated-response';
import {
  BACKEND_ERROR_MESSAGE,
  FORBIDDEN_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  INFO_NOT_FOUND_MESSAGE,
  CATALOG_UNAVAILABLE_MESSAGE,
} from '@/common/constants/error-messages.constants';

export { BACKEND_ERROR_MESSAGE };

export function mapContextOrBackendError(error: unknown): Wf1Response {
  if (error instanceof MissingAuthForOrdersError) {
    return buildOrdersRequiresAuthResponse();
  }

  if (error instanceof ExternalServiceError) {
    if (error.statusCode === 401) {
      return buildOrdersSessionExpiredResponse();
    }

    if (error.statusCode === 403) {
      return {
        ok: false,
        message: FORBIDDEN_MESSAGE,
      };
    }

    if (error.statusCode === 442) {
      return {
        ok: false,
        message: ORDER_NOT_FOUND_MESSAGE,
      };
    }

    if (error.statusCode === 404) {
      return {
        ok: false,
        message: INFO_NOT_FOUND_MESSAGE,
      };
    }

    if (error.statusCode >= 500 || error.errorCode === 'timeout' || error.errorCode === 'network') {
      if (isCatalogUnavailableError(error)) {
        return {
          ok: false,
          message: CATALOG_UNAVAILABLE_MESSAGE,
        };
      }

      return {
        ok: false,
        message: BACKEND_ERROR_MESSAGE,
      };
    }
  }

  return {
    ok: false,
    message: BACKEND_ERROR_MESSAGE,
  };
}

function isCatalogUnavailableError(error: ExternalServiceError): boolean {
  if (error.context) {
    return error.context.endpointGroup === 'catalog';
  }

  if (error.statusCode === 0) {
    return false;
  }

  const responseBody = error.responseBody;
  if (!responseBody || typeof responseBody !== 'object') {
    return true;
  }

  const rawBody = (responseBody as Record<string, unknown>).raw;
  return typeof rawBody === 'string' && rawBody.trim().length > 0;
}
