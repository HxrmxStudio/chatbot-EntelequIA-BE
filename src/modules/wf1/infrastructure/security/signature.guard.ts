import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SignatureValidationService } from './signature-validation';

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(
    private readonly signatureValidationService: SignatureValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    request.signatureValidation =
      await this.signatureValidationService.validateRequest(request);
    return true;
  }
}
