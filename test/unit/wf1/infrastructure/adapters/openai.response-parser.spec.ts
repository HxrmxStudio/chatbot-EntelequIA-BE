import { OpenAiSchemaError } from '@/modules/wf1/infrastructure/adapters/openai/errors';
import { requestOpenAiStructured } from '@/modules/wf1/infrastructure/adapters/openai/openai-client';

describe('openai/response parser', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('parses valid structured output payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'Respuesta valida',
          requires_clarification: false,
          clarifying_question: null,
          confidence_label: 'high',
          _schema_version: '1.0',
        }),
      }),
    }) as typeof fetch;

    const result = await requestOpenAiStructured({
      apiKey: 'key',
      idempotencyKey: 'idem-1',
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

    expect(result.payload.reply).toBe('Respuesta valida');
    expect(result.payload._schema_version).toBe('1.0');
  });

  it('throws OpenAiSchemaError when output is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: 'texto plano no json',
      }),
    }) as typeof fetch;

    await expect(
      requestOpenAiStructured({
        apiKey: 'key',
        idempotencyKey: 'idem-1',
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
      }),
    ).rejects.toBeInstanceOf(OpenAiSchemaError);
  });

  it('throws OpenAiSchemaError when required fields are missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          requires_clarification: false,
          clarifying_question: null,
          confidence_label: 'high',
          _schema_version: '1.0',
        }),
      }),
    }) as typeof fetch;

    await expect(
      requestOpenAiStructured({
        apiKey: 'key',
        idempotencyKey: 'idem-1',
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
      }),
    ).rejects.toBeInstanceOf(OpenAiSchemaError);
  });
});
