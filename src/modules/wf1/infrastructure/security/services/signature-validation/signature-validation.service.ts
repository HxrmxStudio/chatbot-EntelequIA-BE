import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createLogger } from '@/common/utils/logger';
import type { ChannelSource } from '@/modules/wf1/domain/source';
import { resolveBody } from '../../shared';
import { TurnstileVerificationService } from '../turnstile-verification';
import { validateWebSignature } from './web-signature-validator';
import { validateWhatsappSignature } from './whatsapp-signature-validator';
import type { SignatureValidationNodeOutput } from './types';

@Injectable()
export class SignatureValidationService {
  private readonly logger = createLogger(SignatureValidationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly turnstileVerificationService: TurnstileVerificationService,
  ) {}

  async validateRequest(request: Request): Promise<SignatureValidationNodeOutput> {
    const body = resolveBody(request.body);
    const source = body.source;

    try {
      if (source === 'web') {
        await validateWebSignature(
          request,
          this.configService,
          this.turnstileVerificationService,
        );
      } else if (source === 'whatsapp') {
        const secret = this.configService.get<string>('WHATSAPP_SECRET');
        if (!secret) {
          throw new Error('Missing WHATSAPP_SECRET configuration');
        }
        validateWhatsappSignature(request, secret);
      } else {
        throw new Error(`Unknown source: "${String(source)}". Must be 'web' or 'whatsapp'`);
      }

      return {
        validSignature: true,
        source: source as ChannelSource,
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
}
