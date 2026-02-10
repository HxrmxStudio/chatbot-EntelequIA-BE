import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ExtractVariablesService } from './services/extract-variables';

@Injectable()
export class ExtractVariablesGuard implements CanActivate {
  constructor(
    private readonly extractVariablesService: ExtractVariablesService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.inputValidation) {
      throw new BadRequestException(
        'Variable extraction requires input validation output',
      );
    }

    try {
      request.extractedVariables = this.extractVariablesService.extract(
        request.inputValidation,
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }

      throw new BadRequestException(
        'Invalid payload: variable extraction failed',
      );
    }
  }
}
