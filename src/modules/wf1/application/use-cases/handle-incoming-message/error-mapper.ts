import { ExternalServiceError, MissingAuthForOrdersError } from '../../../domain/errors';
import type { Wf1Response } from '../../../domain/wf1-response';

export function mapContextOrBackendError(error: unknown): Wf1Response {
  if (error instanceof MissingAuthForOrdersError) {
    return {
      ok: false,
      requiresAuth: true,
      message: 'Para consultar tus ordenes, inicia sesion.',
    };
  }

  if (error instanceof ExternalServiceError) {
    if (error.statusCode === 401) {
      return {
        ok: false,
        requiresAuth: true,
        message: 'Tu sesion expiro o es invalida. Inicia sesion nuevamente.',
      };
    }

    if (error.statusCode === 403) {
      return {
        ok: false,
        message: 'No tenes permisos para acceder a esa informacion.',
      };
    }

    if (error.statusCode === 442) {
      return {
        ok: false,
        message: 'No encontramos ese pedido en tu cuenta.',
      };
    }

    if (error.statusCode === 404) {
      return {
        ok: false,
        message: 'No encontramos la informacion solicitada.',
      };
    }

    if (error.statusCode >= 500 || error.errorCode === 'timeout' || error.errorCode === 'network') {
      return {
        ok: false,
        message: 'No pudimos procesar tu mensaje.',
      };
    }
  }

  return {
    ok: false,
    message: 'No pudimos procesar tu mensaje.',
  };
}
