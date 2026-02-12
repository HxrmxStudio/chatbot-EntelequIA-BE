import { createHash, createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import {
  BOT_ORDER_LOOKUP_CANONICAL_PATH,
  BOT_ORDER_LOOKUP_METHOD,
  BotHmacSigner,
} from '@/modules/wf1/infrastructure/adapters/entelequia-http';

describe('BotHmacSigner', () => {
  it('builds canonical string with exact contract format', () => {
    const signer = buildSigner('test-secret');
    const rawBody = '{"order_id":12345,"dni":"12345678"}';

    const canonical = signer.buildCanonicalString({
      timestamp: '1739999999',
      nonce: 'nonce-123',
      rawBody,
    });
    const expectedBodyHash = createHash('sha256').update(rawBody).digest('hex');

    expect(canonical).toBe(
      [
        BOT_ORDER_LOOKUP_METHOD,
        BOT_ORDER_LOOKUP_CANONICAL_PATH,
        '1739999999',
        'nonce-123',
        expectedBodyHash,
      ].join('\n'),
    );
  });

  it('signs canonical string with HMAC-SHA256 hex', () => {
    const secret = 'test-secret';
    const signer = buildSigner(secret);
    const rawBody = '{"order_id":12345,"dni":"12345678"}';

    const signature = signer.signOrderLookupRequest({
      timestamp: '1739999999',
      nonce: 'nonce-123',
      rawBody,
    });

    const expectedCanonical = signer.buildCanonicalString({
      timestamp: '1739999999',
      nonce: 'nonce-123',
      rawBody,
    });
    const expectedSignature = createHmac('sha256', secret).update(expectedCanonical).digest('hex');

    expect(signature).toBe(expectedSignature);
  });

  it('throws when secret is not configured', () => {
    const signer = buildSigner('');

    expect(() =>
      signer.signOrderLookupRequest({
        timestamp: '1739999999',
        nonce: 'nonce-123',
        rawBody: '{"order_id":12345}',
      }),
    ).toThrow('BOT_ORDER_LOOKUP_HMAC_SECRET is required');
  });
});

function buildSigner(secret: string): BotHmacSigner {
  const configService: Pick<ConfigService, 'get'> = {
    get: (key: string) =>
      key === 'BOT_ORDER_LOOKUP_HMAC_SECRET' ? secret : undefined,
  };

  return new BotHmacSigner(configService as ConfigService);
}
