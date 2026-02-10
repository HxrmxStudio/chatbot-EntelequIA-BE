import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { SignatureValidationService } from './signature-validation.service';

describe('SignatureValidationService', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('validates web signature and returns node-like merged payload', () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WEBHOOK_SECRET: 'web-secret',
      }),
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

    const result = service.validateRequest(request);

    expect(result.validSignature).toBe(true);
    expect(result.source).toBe('web');
    expect(result.message).toBe('body-pisa-message');
    expect(typeof result.timestamp).toBe('string');
    expect(result.userId).toBe('u-1');
  });

  it('throws SECURITY error when source is unknown', () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WEBHOOK_SECRET: 'web-secret',
      }),
    );

    const request = buildRequest({
      body: {
        source: 'mobile',
      },
      headers: {},
    });

    expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Unknown source: "mobile". Must be \'web\' or \'whatsapp\'',
    );
  });

  it('throws SECURITY error when web header is missing', () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WEBHOOK_SECRET: 'web-secret',
      }),
    );

    const request = buildRequest({
      body: {
        source: 'web',
      },
      headers: {},
    });

    expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Missing web webhook secret header (x-webhook-secret)',
    );
  });

  it('validates WhatsApp signature using raw body', () => {
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

    const result = service.validateRequest(request);

    expect(result.validSignature).toBe(true);
    expect(result.source).toBe('whatsapp');
  });

  it('throws SECURITY error when WhatsApp signature mismatches', () => {
    const service = new SignatureValidationService(
      buildConfigService({
        WHATSAPP_SECRET: 'wa-secret',
      }),
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

    expectUnauthorized(
      () => service.validateRequest(request),
      'SECURITY: Invalid WhatsApp signature - authentication failed',
    );
  });
});

function buildConfigService(
  values: Partial<Record<'WEBHOOK_SECRET' | 'WHATSAPP_SECRET', string>>,
): ConfigService {
  return {
    get: (key: string) =>
      values[key as keyof typeof values] ?? undefined,
  } as unknown as ConfigService;
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

function expectUnauthorized(fn: () => unknown, expectedMessage: string): void {
  try {
    fn();
    throw new Error('Expected UnauthorizedException');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    const unauthorized = error as UnauthorizedException;
    const response = unauthorized.getResponse() as { message?: string };
    expect(response.message).toBe(expectedMessage);
  }
}
