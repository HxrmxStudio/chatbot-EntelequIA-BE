import { ExternalServiceError, MissingAuthForOrdersError } from '../../../domain/errors';
import type { Wf1Response } from '../../../domain/wf1-response';
import {
  buildOrdersRequiresAuthResponse,
  buildOrdersSessionExpiredResponse,
} from './orders-unauthenticated-response';

const FORBIDDEN_MESSAGE = 'No tenes permisos para acceder a esa informacion.';
const ORDER_NOT_FOUND_MESSAGE = 'No encontramos ese pedido en tu cuenta.';
const INFO_NOT_FOUND_MESSAGE = 'No encontramos la informacion solicitada.';
export const BACKEND_ERROR_MESSAGE = 'No pudimos procesar tu mensaje.';

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
