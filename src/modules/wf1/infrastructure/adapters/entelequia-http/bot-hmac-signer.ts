import { createHash, createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const BOT_ORDER_LOOKUP_METHOD = 'POST';
export const BOT_ORDER_LOOKUP_CANONICAL_PATH = '/api/v1/bot/order-lookup';

@Injectable()
export class BotHmacSigner {
  constructor(private readonly configService: ConfigService) {}

  signOrderLookupRequest(input: {
    timestamp: string;
    nonce: string;
    rawBody: string;
  }): string {
    const secret = this.resolveSecret();
    const canonical = this.buildCanonicalString(input);

    return createHmac('sha256', secret).update(canonical).digest('hex');
  }

  buildCanonicalString(input: {
    timestamp: string;
    nonce: string;
    rawBody: string;
  }): string {
    const bodyHash = createHash('sha256').update(input.rawBody).digest('hex');

    return [
      BOT_ORDER_LOOKUP_METHOD,
      BOT_ORDER_LOOKUP_CANONICAL_PATH,
      input.timestamp,
      input.nonce,
      bodyHash,
    ].join('\n');
  }

  private resolveSecret(): string {
    const secret = String(this.configService.get<string>('BOT_ORDER_LOOKUP_HMAC_SECRET') ?? '').trim();
    if (secret.length === 0) {
      throw new Error('BOT_ORDER_LOOKUP_HMAC_SECRET is required');
    }

    return secret;
  }
}
