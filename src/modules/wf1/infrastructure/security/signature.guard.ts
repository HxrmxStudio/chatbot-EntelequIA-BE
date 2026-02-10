import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SignatureValidationService } from './signature-validation.service';

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(
    private readonly signatureValidationService: SignatureValidationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    request.signatureValidation =
      this.signatureValidationService.validateRequest(request);
    return true;
  }
}
