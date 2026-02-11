import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

const INVALID_CREDENTIALS_MESSAGE = 'Firma o credenciales invalidas.';

/**
 * Resolves access token for WF1 requests.
 *
 * Contract:
 * 1) Authorization: Bearer <token> is the only accepted source.
 * 2) Missing header means unauthenticated request.
 * 3) Header present but invalid format -> reject.
 *
 * Never log tokens.
 */
export function resolveAccessToken(input: {
  request: Request;
}): string | undefined {
  const headerValue = input.request.header('authorization');
  const headerToken = parseAuthorizationBearerToken(headerValue);

  if (headerValue !== undefined && !headerToken) {
    // Header present but invalid format.
    throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
  }

  return headerToken;
}

function parseAuthorizationBearerToken(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const token = match[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}
