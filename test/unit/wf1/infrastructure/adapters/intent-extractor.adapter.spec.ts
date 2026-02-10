import type { ConfigService } from '@nestjs/config';
import { IntentExtractorAdapter } from '@/modules/wf1/infrastructure/adapters/intent-extractor';

describe('IntentExtractorAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('returns deterministic fallback when OPENAI_API_KEY is missing', async () => {
    const adapter = buildAdapter({
      OPENAI_API_KEY: undefined,
    });

    const result = await adapter.extractIntent({ text: 'Necesito ayuda' });

    expect(result).toEqual({
      intent: 'general',
      confidence: 0.55,
      entities: [],
    });
  });

  it('normalizes valid model response', async () => {
    global.fetch = jest.fn(async () =>
      mockFetchResponse(
        200,
        JSON.stringify({
          output_text: JSON.stringify({
            intent: 'products',
            confidence: 1.2,
            entities: [' One Piece ', 'One Piece', '', 'tomo 33'],
          }),
        }),
      ),
    ) as typeof fetch;

    const adapter = buildAdapter();

    const result = await adapter.extractIntent({
      text: 'Hola, tienen el tomo 33 de One Piece?',
      requestId: 'req-1',
    });

    const call = (global.fetch as unknown as jest.Mock).mock.calls[0];
    const requestInit = call[1] as RequestInit;
    const requestBody = JSON.parse(String(requestInit.body)) as {
      temperature: number;
      max_output_tokens: number;
      text: { verbosity: string };
    };

    expect(result).toEqual({
      intent: 'products',
      confidence: 1,
      entities: ['One Piece', 'tomo 33'],
    });
    expect(requestBody.temperature).toBe(0.2);
    expect(requestBody.max_output_tokens).toBe(150);
    expect(requestBody.text.verbosity).toBe('medium');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries when model output does not match schema and then succeeds', async () => {
    global.fetch = jest
      .fn()
      .mockImplementationOnce(async () =>
        mockFetchResponse(
          200,
          JSON.stringify({
            output_text: JSON.stringify({
              intent: 'products',
              confidence: 0.9,
              entities: [],
              extra: true,
            }),
          }),
        ),
      )
      .mockImplementationOnce(async () =>
        mockFetchResponse(
          200,
          JSON.stringify({
            output_text: JSON.stringify({
              intent: 'recommendations',
              confidence: 0.91,
              entities: ['manga de accion'],
            }),
          }),
        ),
      ) as typeof fetch;

    const adapter = buildAdapter();
    const result = await adapter.extractIntent({ text: 'Quiero empezar a leer manga de accion' });

    expect(result.intent).toBe('recommendations');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back after max attempts on 429 errors', async () => {
    global.fetch = jest.fn(async () => mockFetchResponse(429, '{"error":"rate_limit"}')) as typeof fetch;

    const adapter = buildAdapter();
    const result = await adapter.extractIntent({ text: 'Hola' });

    expect(result).toEqual({
      intent: 'general',
      confidence: 0.55,
      entities: [],
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

function buildAdapter(overrides?: Partial<Record<string, string | number | undefined>>): IntentExtractorAdapter {
  const config: Record<string, string | number | undefined> = {
    OPENAI_API_KEY: 'test-key',
    OPENAI_TIMEOUT_MS: 5000,
    ...(overrides ?? {}),
  };

  const configService: Pick<ConfigService, 'get'> = {
    get: (key: string) => config[key],
  };

  return new IntentExtractorAdapter(configService as ConfigService);
}

function mockFetchResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}
