import {
  requestOpenAiLegacy,
  requestOpenAiStructured,
} from '@/modules/wf1/infrastructure/adapters/openai/openai-client';

describe('openai/openai-client requests', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends structured request with json_schema and idempotency header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'ok',
          requires_clarification: false,
          clarifying_question: null,
          confidence_label: 'high',
          _schema_version: '1.0',
        }),
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    await requestOpenAiStructured({
      apiKey: 'key',
      idempotencyKey: 'idem-123',
      model: 'gpt-4.1-mini',
      timeoutMs: 1000,
      systemPrompt: 'system',
      schema: { type: 'object' },
      payload: {
        userText: 'hola',
        intent: 'general',
        history: [],
        contextBlocks: [],
      },
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-123');
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body['text']).toEqual(
      expect.objectContaining({
        format: expect.objectContaining({
          type: 'json_schema',
          strict: true,
        }),
      }),
    );
    expect(body['max_output_tokens']).toBe(90);
  });

  it('sends legacy request without json_schema field', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: 'respuesta legacy',
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    await requestOpenAiLegacy({
      apiKey: 'key',
      idempotencyKey: 'idem-123',
      model: 'gpt-4.1-mini',
      timeoutMs: 1000,
      systemPrompt: 'system',
      payload: {
        userText: 'hola',
        intent: 'general',
        history: [],
        contextBlocks: [],
      },
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body['text']).toBeUndefined();
    expect(body['max_output_tokens']).toBe(90);
  });
});
