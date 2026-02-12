import type { ConfigService } from '@nestjs/config';
import {
  BotHmacSigner,
  EntelequiaOrderLookupClient,
} from '@/modules/wf1/infrastructure/adapters/entelequia-http';

describe('EntelequiaOrderLookupClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('returns order summary on 200 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          order: {
            id: 12345,
            state: 'En preparación',
            total: { currency: 'ARS', amount: 5100 },
            payment_method: 'Mercado Pago',
            ship_method: 'Envío - Correo',
            tracking_code: 'ABC123',
          },
        }),
    }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-1',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.id).toBe(12345);
      expect(result.order.state).toBe('En preparación');
      expect(result.order.shipMethod).toBe('Envío - Correo');
      expect(result.order.trackingCode).toBe('ABC123');
    }
  });

  it('returns not_found_or_mismatch on 404 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 404,
      ok: false,
      text: async () => '{"message":"Order data could not be validated."}',
    }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-2',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    expect(result).toEqual({
      ok: false,
      code: 'not_found_or_mismatch',
      statusCode: 404,
    });
  });

  it('retries once on 401 and succeeds after signature refresh', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request."}',
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            order: { id: 12345, state: 'En preparación' },
          }),
      }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-3',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('returns unauthorized when backend keeps rejecting with stale timestamp', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request.","reason_code":"INVALID_TIMESTAMP"}',
      })
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request.","reason_code":"INVALID_TIMESTAMP"}',
      }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-4',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      code: 'unauthorized',
      statusCode: 401,
    });
  });

  it('returns unauthorized when backend rejects invalid signature repeatedly', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request.","reason_code":"INVALID_SIGNATURE"}',
      })
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request.","reason_code":"INVALID_SIGNATURE"}',
      }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-4b',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      code: 'unauthorized',
      statusCode: 401,
    });
  });

  it('returns unauthorized when backend rejects replay nonce repeatedly', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request.","reason_code":"REPLAY_NONCE"}',
      })
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => '{"message":"Unauthorized request.","reason_code":"REPLAY_NONCE"}',
      }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-5',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    expect(result).toEqual({
      ok: false,
      code: 'unauthorized',
      statusCode: 401,
    });
  });

  it('returns invalid_payload on 422 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 422,
      ok: false,
      text: async () => '{"error":"Debe enviar al menos 2 datos de identidad"}',
    }) as typeof fetch;

    const client = buildClient();
    const result = await client.lookupOrder({
      requestId: 'req-6',
      orderId: 12345,
      identity: {
        dni: '12345678',
      },
    });

    expect(result).toEqual({
      ok: false,
      code: 'invalid_payload',
      statusCode: 422,
    });
  });

  it('retries throttled responses with backoff and succeeds', async () => {
    jest.useFakeTimers();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        text: async () => '{"message":"Too Many Attempts."}',
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            order: { id: 12345, state: 'En preparación' },
          }),
      }) as typeof fetch;

    const client = buildClient({
      BOT_ORDER_LOOKUP_RETRY_MAX: 1,
      BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS: 50,
    });
    const promise = client.lookupOrder({
      requestId: 'req-7',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('returns throttled when 429 persists after retry limit', async () => {
    jest.useFakeTimers();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        text: async () => '{"message":"Too Many Attempts."}',
      })
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        text: async () => '{"message":"Too Many Attempts."}',
      }) as typeof fetch;

    const client = buildClient({
      BOT_ORDER_LOOKUP_RETRY_MAX: 1,
      BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS: 10,
    });
    const promise = client.lookupOrder({
      requestId: 'req-8',
      orderId: 12345,
      identity: {
        dni: '12345678',
        phone: '+54 11 4444 5555',
      },
    });

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result).toEqual({
      ok: false,
      code: 'throttled',
      statusCode: 429,
    });
  });
});

function buildClient(
  overrides: Partial<
    Record<
      | 'ENTELEQUIA_BASE_URL'
      | 'BOT_ORDER_LOOKUP_HMAC_SECRET'
      | 'BOT_ORDER_LOOKUP_TIMEOUT_MS'
      | 'BOT_ORDER_LOOKUP_RETRY_MAX'
      | 'BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS',
      string | number
    >
  > = {},
): EntelequiaOrderLookupClient {
  const values = {
    ENTELEQUIA_BASE_URL: 'https://entelequia.com.ar',
    BOT_ORDER_LOOKUP_HMAC_SECRET: 'test-secret',
    BOT_ORDER_LOOKUP_TIMEOUT_MS: 8000,
    BOT_ORDER_LOOKUP_RETRY_MAX: 1,
    BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS: 500,
    ...overrides,
  };

  const configService: Pick<ConfigService, 'get'> = {
    get: (key: string) => values[key as keyof typeof values] as never,
  };

  const signer = new BotHmacSigner(configService as ConfigService);
  return new EntelequiaOrderLookupClient(configService as ConfigService, signer);
}
