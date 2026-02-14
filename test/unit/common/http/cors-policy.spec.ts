import {
  buildCorsOriginHandler,
  isAllowedOrigin,
  normalizeOrigin,
  resolveCorsMode,
} from '@/common/http/cors-policy';

describe('cors-policy', () => {
  it('normalizes origins removing trailing slash and lowercasing host', () => {
    expect(normalizeOrigin('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173');
    expect(normalizeOrigin('https://Entelequia.com.ar')).toBe('https://entelequia.com.ar');
  });

  it('matches allowed origins by normalized value', () => {
    expect(
      isAllowedOrigin('http://127.0.0.1:5173/', [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ]),
    ).toBe(true);
  });

  it('uses permissive mode outside production', () => {
    expect(resolveCorsMode({ NODE_ENV: 'development' })).toBe('development_permissive');
    expect(resolveCorsMode({ NODE_ENV: 'test' })).toBe('development_permissive');
  });

  it('uses strict mode in production and rejects non-allowlisted origins', () => {
    const originHandler = buildCorsOriginHandler({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: ['https://entelequia.com.ar'],
    });

    const callback = jest.fn<void, [Error | null, boolean?]>();
    originHandler('https://evil.example', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(callback.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('allows any origin in development mode', () => {
    const originHandler = buildCorsOriginHandler({
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: [],
    });

    const callback = jest.fn<void, [Error | null, boolean?]>();
    originHandler('https://any-origin.example', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
