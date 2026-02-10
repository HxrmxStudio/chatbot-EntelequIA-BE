import type { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '../../domain/errors';
import { EntelequiaHttpAdapter } from './entelequia-http.adapter';

describe('EntelequiaHttpAdapter', () => {
  const originalFetch = global.fetch;
  const baseUrl = 'https://api.test.com/v1';

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  function buildAdapter(): EntelequiaHttpAdapter {
    const config: Pick<ConfigService, 'get'> = {
      get: (key: string) =>
        key === 'ENTELEQUIA_API_BASE_URL'
          ? baseUrl
          : key === 'ENTELEQUIA_API_TIMEOUT_MS'
            ? 5000
            : undefined,
    };
    return new EntelequiaHttpAdapter(config as ConfigService);
  }

  it('throws ExternalServiceError with statusCode and errorCode on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"error":"not found"}',
    }) as typeof fetch;

    const adapter = buildAdapter();

    let err: ExternalServiceError | undefined;
    try {
      await adapter.getProducts({});
    } catch (e) {
      err = e as ExternalServiceError;
    }

    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err?.statusCode).toBe(404);
    expect(err?.errorCode).toBe('http');
  });

  it('throws ExternalServiceError with timeout on AbortError', async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      return Promise.reject(e);
    }) as typeof fetch;

    const adapter = buildAdapter();

    let err: ExternalServiceError | undefined;
    try {
      await adapter.getProducts({});
    } catch (e) {
      err = e as ExternalServiceError;
    }

    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err?.errorCode).toBe('timeout');
  });

  it('returns context block on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"data":[{"id":1}]}',
    }) as typeof fetch;

    const adapter = buildAdapter();
    const result = await adapter.getProducts({ query: 'manga' });

    expect(result.contextType).toBe('products');
    expect(result.contextPayload).toEqual({ data: [{ id: 1 }] });
  });

  it('calls correct URL for getProducts with query', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '{}',
    }) as typeof fetch;

    const adapter = buildAdapter();
    await adapter.getProducts({ query: 'One Piece', currency: 'ARS' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/products-list?'),
      expect.any(Object),
    );
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('q=One+Piece');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('currency=ARS');
  });
});
