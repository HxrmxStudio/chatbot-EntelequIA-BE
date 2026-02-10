import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { ChannelSource } from '../../domain/source';
import { createLogger } from '../../../../common/utils/logger';

export type SignatureValidationNodeOutput = {
  validSignature: true;
  source: ChannelSource;
  timestamp: string;
  message: string;
} & Record<string, unknown>;

@Injectable()
export class SignatureValidationService {
  private readonly logger = createLogger(SignatureValidationService.name);

  constructor(private readonly configService: ConfigService) {}

  validateRequest(request: Request): SignatureValidationNodeOutput {
    const body = resolveBody(request.body);
    const source = body.source;

    try {
      if (source === 'web') {
        this.validateWebSignature(request);
      } else if (source === 'whatsapp') {
        this.validateWhatsappSignature(request);
      } else {
        throw new Error(`Unknown source: "${String(source)}". Must be 'web' or 'whatsapp'`);
      }

      return {
        validSignature: true,
        source,
        timestamp: new Date().toISOString(),
        message: 'Signature validation passed',
        ...body,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown signature validation error';
      this.logger.security('Signature validation failed', { message });
      throw new UnauthorizedException(`SECURITY: ${message}`);
    }
  }

  private validateWebSignature(request: Request): void {
    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');
    if (!expectedSecret || expectedSecret.trim().length === 0) {
      throw new Error('Missing WEBHOOK_SECRET configuration');
    }

    const providedSecret = request.header('x-webhook-secret');
    if (!providedSecret || providedSecret.trim().length === 0) {
      throw new Error('Missing web webhook secret header (x-webhook-secret)');
    }

    if (!secureEquals(providedSecret, expectedSecret)) {
      throw new Error('Invalid web webhook secret - authentication failed');
    }
  }

  private validateWhatsappSignature(request: Request): void {
    const secret = this.configService.get<string>('WHATSAPP_SECRET');
    if (!secret || secret.trim().length === 0) {
      throw new Error('Missing WHATSAPP_SECRET configuration');
    }

    const signature = request.header('x-hub-signature-256');
    if (!signature || signature.trim().length === 0) {
      throw new Error(
        'Missing WhatsApp signature header (x-hub-signature-256)',
      );
    }

    if (typeof request.rawBody !== 'string') {
      throw new Error('Missing raw request body for WhatsApp signature validation');
    }

    const rawBody = request.rawBody;
    const expectedSignature = `sha256=${createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    if (!secureEquals(signature, expectedSignature)) {
      throw new Error('Invalid WhatsApp signature - authentication failed');
    }
  }
}

function resolveBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {};
  }

  return body as Record<string, unknown>;
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
