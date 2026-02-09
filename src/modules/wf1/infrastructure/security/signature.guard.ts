import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const source = this.extractSource(request);

    if (source === 'web') {
      this.validateWebSecret(request);
      return true;
    }

    if (source === 'whatsapp') {
      this.validateWhatsappSignature(request);
      return true;
    }

    return true;
  }

  private extractSource(request: Request): 'web' | 'whatsapp' | undefined {
    const body = request.body as Record<string, unknown> | undefined;
    const source = body?.source;
    if (source === 'web' || source === 'whatsapp') {
      return source;
    }

    return undefined;
  }

  private validateWebSecret(request: Request): void {
    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');
    if (!expectedSecret) {
      return;
    }

    const providedSecret = request.header('x-webhook-secret');

    if (!providedSecret || !secureEquals(providedSecret, expectedSecret)) {
      throw new UnauthorizedException('Firma o credenciales invalidas.');
    }
  }

  private validateWhatsappSignature(request: Request): void {
    const secret = this.configService.get<string>('WHATSAPP_SECRET');
    if (!secret) {
      return;
    }

    const providedSignature = request.header('x-hub-signature-256');
    if (!providedSignature) {
      throw new UnauthorizedException('Firma o credenciales invalidas.');
    }

    const body = request.rawBody ?? JSON.stringify(request.body ?? {});
    const expectedSignature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    if (!secureEquals(providedSignature, expectedSignature)) {
      throw new UnauthorizedException('Firma o credenciales invalidas.');
    }
  }
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
