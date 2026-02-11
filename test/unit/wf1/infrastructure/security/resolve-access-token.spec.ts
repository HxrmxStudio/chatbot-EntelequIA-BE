import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { resolveAccessToken } from '@/modules/wf1/controllers/resolve-access-token';

describe('resolveAccessToken', () => {
  it('returns token from Authorization header when bearer is valid', () => {
    const request = buildRequest('Bearer valid-token');

    const token = resolveAccessToken({ request });

    expect(token).toBe('valid-token');
  });

  it('returns undefined when Authorization header is missing', () => {
    const request = buildRequest(undefined);

    const token = resolveAccessToken({ request });

    expect(token).toBeUndefined();
  });

  it('throws UnauthorizedException when Authorization header is malformed', () => {
    const request = buildRequest('Token malformed');

    expect(() => resolveAccessToken({ request })).toThrow(UnauthorizedException);
    expect(() => resolveAccessToken({ request })).toThrow('Firma o credenciales invalidas.');
  });

  it('throws UnauthorizedException when bearer token is empty', () => {
    const request = buildRequest('Bearer    ');

    expect(() => resolveAccessToken({ request })).toThrow(UnauthorizedException);
    expect(() => resolveAccessToken({ request })).toThrow('Firma o credenciales invalidas.');
  });
});

function buildRequest(authorizationValue: string | undefined): Request {
  return {
    header: (name: string): string | undefined =>
      name.toLowerCase() === 'authorization' ? authorizationValue : undefined,
  } as unknown as Request;
}
