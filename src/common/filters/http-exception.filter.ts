import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createLogger } from '../utils/logger';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = createLogger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? this.safeHttpMessage(exception)
        : 'No pudimos procesar tu mensaje.';

    if (status >= 500) {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception : undefined,
        {
          path: request.path,
          requestId: request.requestId,
        },
      );
    }

    response.status(status).json({
      ok: false,
      message,
      requestId: request.requestId,
    });
  }

  private safeHttpMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      typeof response.message === 'string'
    ) {
      return response.message;
    }

    if (exception.getStatus() === HttpStatus.BAD_REQUEST) {
      return 'Payload invalido.';
    }

    if (exception.getStatus() === HttpStatus.UNAUTHORIZED) {
      return 'Firma o credenciales invalidas.';
    }

    return 'No pudimos procesar tu mensaje.';
  }
}
