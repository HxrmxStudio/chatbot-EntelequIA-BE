import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@/common/utils/logger';
import { resolveOptionalString } from '../shared';
import { verifyTurnstileToken } from './turnstile-client';

@Injectable()
export class TurnstileVerificationService {
  private readonly logger = createLogger(TurnstileVerificationService.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyToken(input: {
    token: string;
    requestId?: string;
    remoteIp?: string;
  }): Promise<void> {
    const secret = resolveOptionalString(
      this.configService.get<string>('TURNSTILE_SECRET_KEY'),
    );
    if (!secret) {
      throw new Error('Missing TURNSTILE_SECRET_KEY configuration');
    }

    const token = input.token.trim();
    if (token.length === 0) {
      throw new Error('Missing Turnstile token');
    }

    try {
      const data = await verifyTurnstileToken({
        secret,
        token,
        remoteIp: input.remoteIp,
      });

      if (data.success !== true) {
        this.logger.security('Turnstile verification rejected request', {
          requestId: input.requestId,
          errorCodes: data['error-codes'] ?? [],
        });
        throw new Error('Invalid Turnstile token');
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Invalid Turnstile token') {
        throw error;
      }

      this.logger.security('Turnstile verification failed', {
        requestId: input.requestId,
        error:
          error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Turnstile verification failed');
    }
  }
}
