import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { InputValidationService } from './input-validation.service';

@Injectable()
export class InputValidationGuard implements CanActivate {
  constructor(
    private readonly inputValidationService: InputValidationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signatureOutput = request.signatureValidation;

    if (!signatureOutput) {
      throw new BadRequestException(
        'Input validation requires signature validation output',
      );
    }

    try {
      request.inputValidation =
        this.inputValidationService.validate(signatureOutput);
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }

      throw new BadRequestException('Invalid payload');
    }
  }
}
