import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { SignatureValidationService } from '@/modules/wf1/infrastructure/security/services/signature-validation';
import { TurnstileVerificationService } from '@/modules/wf1/infrastructure/security/services/turnstile-verification';

describe('SignatureValidationService', () => {
  const originalConsoleError = console.error;
  const originalFetch = global.fetch;

  beforeEach(() => {
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    global.fetch = originalFetch;
  });

  it('validates web signature and returns node-like merged payload', async () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WEBHOOK_SECRET: 'web-secret',
      }),
      buildTurnstileService(),
    );

    const request = buildRequest({
      body: {
        source: 'web',
        userId: 'u-1',
        message: 'body-pisa-message',
      },
      headers: {
        'x-webhook-secret': 'web-secret',
      },
    });

    const result = await service.validateRequest(request);

    expect(result.validSignature).toBe(true);
    expect(result.source).toBe('web');
    expect(result.message).toBe('body-pisa-message');
    expect(typeof result.timestamp).toBe('string');
    expect(result.userId).toBe('u-1');
  });

  it('throws SECURITY error when source is unknown', async () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WEBHOOK_SECRET: 'web-secret',
      }),
      buildTurnstileService(),
    );

    const request = buildRequest({
      body: {
        source: 'mobile',
      },
      headers: {},
    });

    await expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Unknown source: "mobile". Must be \'web\' or \'whatsapp\'',
    );
  });

  it('throws SECURITY error when web header is missing', async () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WEBHOOK_SECRET: 'web-secret',
      }),
      buildTurnstileService(),
    );

    const request = buildRequest({
      body: {
        source: 'web',
      },
      headers: {},
    });

    await expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Missing web webhook secret header (x-webhook-secret)',
    );
  });

  it('validates WhatsApp signature using raw body', async () => {
    const secret = 'wa-secret';
    const rawBody = JSON.stringify({
      source: 'whatsapp',
      text: 'hola',
    });
    const expectedSignature = `sha256=${createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    const service = new SignatureValidationService(
      buildConfigService({
        WHATSAPP_SECRET: secret,
      }),
      buildTurnstileService(),
    );

    const request = buildRequest({
      body: {
        source: 'whatsapp',
        text: 'hola',
      },
      rawBody,
      headers: {
        'x-hub-signature-256': expectedSignature,
      },
    });

    const result = await service.validateRequest(request);

    expect(result.validSignature).toBe(true);
    expect(result.source).toBe('whatsapp');
  });

  it('throws SECURITY error when WhatsApp signature mismatches', async () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WHATSAPP_SECRET: 'wa-secret',
      }),
      buildTurnstileService(),
    );

    const request = buildRequest({
      body: {
        source: 'whatsapp',
      },
      rawBody: '{"source":"whatsapp"}',
      headers: {
        'x-hub-signature-256': 'sha256=invalid',
      },
    });

    await expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Invalid WhatsApp signature - authentication failed',
    );
  });

  it('validates Turnstile token when TURNSTILE_SECRET_KEY is configured', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
      status: 200,
    })) as unknown as typeof global.fetch;

    const service = new SignatureValidationService(
      buildConfigService({
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
      }),
      buildTurnstileService({
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
      }),
    );

    const request = buildRequest({
      body: {
        source: 'web',
      },
      headers: {
        'x-turnstile-token': 'turnstile-token',
      },
    });

    const result = await service.validateRequest(request);
    expect(result.validSignature).toBe(true);
  });

  it('throws SECURITY error when Turnstile token header is missing', async () => {
    const service = new SignatureValidationService(
      buildConfigService({
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
      }),
      buildTurnstileService({
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
      }),
    );

    const request = buildRequest({
      body: {
        source: 'web',
      },
      headers: {},
    });

    await expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Missing Turnstile token header (x-turnstile-token)',
    );
  });

  it('throws SECURITY error when Turnstile verification rejects the token', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      status: 200,
    })) as unknown as typeof global.fetch;

    const service = new SignatureValidationService(
      buildConfigService({
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
      }),
      buildTurnstileService({
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
      }),
    );

    const request = buildRequest({
      body: {
        source: 'web',
      },
      headers: {
        'x-turnstile-token': 'turnstile-token',
      },
    });

    await expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Invalid Turnstile token',
    );
  });
});

function buildConfigService(
  values: Partial<Record<'WEBHOOK_SECRET' | 'WHATSAPP_SECRET' | 'TURNSTILE_SECRET_KEY', string>>,
): ConfigService {
  return {
    get: (key: string) =>
      values[key as keyof typeof values] ?? undefined,
  } as unknown as ConfigService;
}

function buildTurnstileService(
  values: Partial<Record<'TURNSTILE_SECRET_KEY', string>> = {},
): TurnstileVerificationService {
  return new TurnstileVerificationService(buildConfigService(values));
}

function buildRequest(input: {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  rawBody?: string;
}): Request {
  const normalizedHeaders = new Map(
    Object.entries(input.headers).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );

  return {
    body: input.body,
    rawBody: input.rawBody,
    header: (name: string) => normalizedHeaders.get(name.toLowerCase()),
  } as unknown as Request;
}

async function expectUnauthorized(fn: () => unknown, expectedMessage: string): Promise<void> {
  try {
    await fn();
    throw new Error('Expected UnauthorizedException');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    const unauthorized = error as UnauthorizedException;
    const response = unauthorized.getResponse() as { message?: string };
    expect(response.message).toBe(expectedMessage);
  }
}
