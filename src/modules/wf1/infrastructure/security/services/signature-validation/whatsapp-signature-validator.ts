import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { secureEquals } from '../../shared';
import { HEADER_WHATSAPP_SIGNATURE } from './constants';

export function validateWhatsappSignature(
  request: Request,
  secret: string,
): void {
  if (!secret || secret.trim().length === 0) {
    throw new Error('Missing WHATSAPP_SECRET configuration');
  }

  const signature = request.header(HEADER_WHATSAPP_SIGNATURE);
  if (!signature || signature.trim().length === 0) {
    throw new Error(
      `Missing WhatsApp signature header (${HEADER_WHATSAPP_SIGNATURE})`,
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
