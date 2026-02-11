import { ExternalServiceError, MissingAuthForOrdersError } from '../../../domain/errors';
import type { Wf1Response } from '../../../domain/wf1-response';

const ORDERS_REQUIRES_AUTH_MESSAGE = 'Para consultar tus ordenes, inicia sesion.';
const SESSION_EXPIRED_MESSAGE = 'Tu sesion expiro o es invalida. Inicia sesion nuevamente.';
const FORBIDDEN_MESSAGE = 'No tenes permisos para acceder a esa informacion.';
const ORDER_NOT_FOUND_MESSAGE = 'No encontramos ese pedido en tu cuenta.';
const INFO_NOT_FOUND_MESSAGE = 'No encontramos la informacion solicitada.';
export const BACKEND_ERROR_MESSAGE = 'No pudimos procesar tu mensaje.';

export function buildOrdersRequiresAuthResponse(): Wf1Response {
  return {
    ok: false,
    requiresAuth: true,
    message: ORDERS_REQUIRES_AUTH_MESSAGE,
  };
}

export function mapContextOrBackendError(error: unknown): Wf1Response {
  if (error instanceof MissingAuthForOrdersError) {
    return buildOrdersRequiresAuthResponse();
  }

  if (error instanceof ExternalServiceError) {
    if (error.statusCode === 401) {
      return {
        ok: false,
        requiresAuth: true,
        message: SESSION_EXPIRED_MESSAGE,
      };
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
