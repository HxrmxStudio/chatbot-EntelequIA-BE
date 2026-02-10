import { ensureObject } from '@/common/utils/object.utils';
import { resolveOptionalString } from '../shared';
import { TURNSTILE_VERIFY_URL } from './constants';
import type { TurnstileVerifyResponse } from './types';

export async function verifyTurnstileToken(input: {
  secret: string;
  token: string;
  remoteIp?: string;
}): Promise<TurnstileVerifyResponse> {
  const body = new URLSearchParams();
  body.set('secret', input.secret);
  body.set('response', input.token);

  const remoteIp = resolveOptionalString(input.remoteIp);
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const json = await response.json();
  const object = ensureObject(json, 'Invalid Turnstile response payload');

  return {
    success: object.success === true,
    'error-codes': Array.isArray(object['error-codes'])
      ? object['error-codes'].map((code) => String(code))
      : undefined,
  };
}
