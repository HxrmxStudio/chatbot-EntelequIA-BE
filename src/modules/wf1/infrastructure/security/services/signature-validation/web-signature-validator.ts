import type { Request } from 'express';
import { resolveOptionalString, secureEquals } from '../../shared';
import { HEADER_TURNSTILE_TOKEN, HEADER_WEBHOOK_SECRET } from './constants';
import type { TurnstileVerificationService } from '../turnstile-verification';

export async function validateWebSignature(
  request: Request,
  configService: {
    get: <T>(key: string) => T | undefined;
  },
  turnstileVerificationService: TurnstileVerificationService,
): Promise<void> {
  const requestId = request.requestId;

  // Validate Turnstile token if configured
  const turnstileSecret = resolveOptionalString(
    configService.get<string>('TURNSTILE_SECRET_KEY'),
  );
  if (turnstileSecret) {
    const token = request.header(HEADER_TURNSTILE_TOKEN);
    if (!token || token.trim().length === 0) {
      throw new Error(
        `Missing Turnstile token header (${HEADER_TURNSTILE_TOKEN})`,
      );
    }

    await turnstileVerificationService.verifyToken({
      token,
      requestId,
    });
  }

  // Validate webhook secret if configured
  const expectedSecret = resolveOptionalString(
    configService.get<string>('WEBHOOK_SECRET'),
  );
  if (!expectedSecret) {
    return;
  }

  const providedSecret = request.header(HEADER_WEBHOOK_SECRET);
  if (!providedSecret || providedSecret.trim().length === 0) {
    throw new Error(
      `Missing web webhook secret header (${HEADER_WEBHOOK_SECRET})`,
    );
  }

  if (!secureEquals(providedSecret, expectedSecret)) {
    throw new Error('Invalid web webhook secret - authentication failed');
  }
}
