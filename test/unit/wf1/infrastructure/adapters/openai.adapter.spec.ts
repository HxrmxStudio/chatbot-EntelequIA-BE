import { ConfigService } from '@nestjs/config';
import { OpenAiAdapter } from '@/modules/wf1/infrastructure/adapters/openai';

describe('OpenAiAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('returns fallback when OPENAI_API_KEY is missing', async () => {
    const adapter = new OpenAiAdapter({
      get: (key: string) => (key === 'OPENAI_API_KEY' ? undefined : 'gpt-4.1-mini'),
    } as ConfigService);

    const result = await adapter.buildAssistantReply({
      userText: 'hola',
      intent: 'general',
      history: [],
      contextBlocks: [],
    });

    expect(result).toContain('Perfecto');
  });

  it('returns orders fallback for orders intent when key missing', async () => {
    const adapter = new OpenAiAdapter({
      get: (key: string) => (key === 'OPENAI_API_KEY' ? undefined : undefined),
    } as ConfigService);

    const result = await adapter.buildAssistantReply({
      userText: 'mi pedido',
      intent: 'orders',
      history: [],
      contextBlocks: [],
    });

    expect(result).toContain('pedido');
  });

  it('returns fallback after retries exhausted on 429', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'key' : key === 'OPENAI_TIMEOUT_MS' ? 5000 : 'gpt-4.1-mini'),
    } as ConfigService);

    const result = await adapter.buildAssistantReply({
      userText: 'hola',
      intent: 'general',
      history: [],
      contextBlocks: [],
    });

    expect(result).toContain('Perfecto');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns response text on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: 'Hola! En que te puedo ayudar?',
      }),
    }) as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'key' : key === 'OPENAI_TIMEOUT_MS' ? 5000 : 'gpt-4.1-mini'),
    } as ConfigService);

    const result = await adapter.buildAssistantReply({
      userText: 'hola',
      intent: 'general',
      history: [],
      contextBlocks: [],
    });

    expect(result).toBe('Hola! En que te puedo ayudar?');
  });
});
