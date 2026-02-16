import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import {
  BACKEND_ERROR_MESSAGE,
  INVALID_PAYLOAD_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from '../constants/error-messages.constants';

const SAFE_FALLBACK_MESSAGE = BACKEND_ERROR_MESSAGE;

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
        : SAFE_FALLBACK_MESSAGE;

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
      return INVALID_PAYLOAD_MESSAGE;
    }

    if (exception.getStatus() === HttpStatus.UNAUTHORIZED) {
      return INVALID_CREDENTIALS_MESSAGE;
    }

    return SAFE_FALLBACK_MESSAGE;
  }
}
