import { ConfigService } from '@nestjs/config';
import { OpenAiAdapter } from '@/modules/wf1/infrastructure/adapters/openai';

describe('OpenAiAdapter', () => {
  const originalFetch = global.fetch;
  const metricsStub = {
    incrementMessage: jest.fn(),
    observeResponseLatency: jest.fn(),
    incrementFallback: jest.fn(),
    incrementStockExactDisclosure: jest.fn(),
    incrementOrderLookupRateLimited: jest.fn(),
    incrementOrderLookupRateLimitDegraded: jest.fn(),
    incrementOrderLookupVerificationFailed: jest.fn(),
    incrementRecommendationsFranchiseMatch: jest.fn(),
    incrementRecommendationsCatalogDegraded: jest.fn(),
    incrementRecommendationsNoMatch: jest.fn(),
    incrementRecommendationsDisambiguationTriggered: jest.fn(),
    incrementRecommendationsDisambiguationResolved: jest.fn(),
    incrementRecommendationsEditorialMatch: jest.fn(),
    incrementRecommendationsEditorialSuggested: jest.fn(),
    incrementOrderFlowAmbiguousAck: jest.fn(),
    incrementOrderFlowHijackPrevented: jest.fn(),
    incrementOutputTechnicalTermsSanitized: jest.fn(),
    incrementFeedbackReceived: jest.fn(),
    incrementUiPayloadEmitted: jest.fn(),
    incrementUiPayloadSuppressed: jest.fn(),
    incrementLearningAutopromote: jest.fn(),
    incrementLearningAutorollback: jest.fn(),
  };

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    metricsStub.incrementMessage.mockReset();
    metricsStub.observeResponseLatency.mockReset();
    metricsStub.incrementFallback.mockReset();
    metricsStub.incrementStockExactDisclosure.mockReset();
    metricsStub.incrementOrderLookupRateLimited.mockReset();
    metricsStub.incrementOrderLookupRateLimitDegraded.mockReset();
    metricsStub.incrementOrderLookupVerificationFailed.mockReset();
    metricsStub.incrementRecommendationsFranchiseMatch.mockReset();
    metricsStub.incrementRecommendationsCatalogDegraded.mockReset();
    metricsStub.incrementRecommendationsNoMatch.mockReset();
    metricsStub.incrementRecommendationsDisambiguationTriggered.mockReset();
    metricsStub.incrementRecommendationsDisambiguationResolved.mockReset();
    metricsStub.incrementRecommendationsEditorialMatch.mockReset();
    metricsStub.incrementRecommendationsEditorialSuggested.mockReset();
    metricsStub.incrementOrderFlowAmbiguousAck.mockReset();
    metricsStub.incrementOrderFlowHijackPrevented.mockReset();
    metricsStub.incrementOutputTechnicalTermsSanitized.mockReset();
    metricsStub.incrementFeedbackReceived.mockReset();
    metricsStub.incrementUiPayloadEmitted.mockReset();
    metricsStub.incrementUiPayloadSuppressed.mockReset();
    metricsStub.incrementLearningAutopromote.mockReset();
    metricsStub.incrementLearningAutorollback.mockReset();
  });

  it('returns fallback when OPENAI_API_KEY is missing', async () => {
    const adapter = new OpenAiAdapter({
      get: (key: string) =>
        key === 'OPENAI_API_KEY'
          ? undefined
          : key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT'
            ? true
            : key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT'
              ? 100
              : 'gpt-4.1-mini',
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('general'));

    expect(resolveMessage(result)).toContain('Perfecto');
    expect(resolvePromptVersion(result)).toBe('assistant_v2');
  });

  it('returns orders fallback for orders intent when key missing', async () => {
    const adapter = new OpenAiAdapter({
      get: (key: string) => (key === 'OPENAI_API_KEY' ? undefined : 'gpt-4.1-mini'),
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('orders'));

    expect(resolveMessage(result)).toContain('pedido');
  });

  it('returns fallback after retries exhausted on 429', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => {
        if (key === 'OPENAI_API_KEY') return 'key';
        if (key === 'OPENAI_TIMEOUT_MS') return 5000;
        if (key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT') return true;
        if (key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT') return 100;
        return 'gpt-4.1-mini';
      },
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('general'));

    expect(resolveMessage(result)).toContain('Perfecto');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses legacy path when structured output flag is disabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: 'Respuesta legacy',
        usage: {
          input_tokens: 120,
          output_tokens: 40,
        },
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => {
        if (key === 'OPENAI_API_KEY') return 'key';
        if (key === 'OPENAI_TIMEOUT_MS') return 5000;
        if (key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT') return false;
        if (key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT') return 0;
        return 'gpt-4.1-mini';
      },
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('general'));

    expect(resolveMessage(result)).toBe('Respuesta legacy');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body['text']).toBeUndefined();
  });

  it('uses structured path when flag is enabled and rollout is 100', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          reply: 'Respuesta estructurada',
          requires_clarification: false,
          clarifying_question: null,
          confidence_label: 'high',
          _schema_version: '1.0',
        }),
        usage: {
          input_tokens: 100,
          output_tokens: 25,
          input_tokens_details: {
            cached_tokens: 80,
          },
        },
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => {
        if (key === 'OPENAI_API_KEY') return 'key';
        if (key === 'OPENAI_TIMEOUT_MS') return 5000;
        if (key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT') return true;
        if (key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT') return 100;
        return 'gpt-4.1-mini';
      },
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('general'));

    expect(resolveMessage(result)).toBe('Respuesta estructurada');
    expect(resolvePromptVersion(result)).toBe('assistant_v2');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body['text']).toEqual(
      expect.objectContaining({
        format: expect.objectContaining({
          type: 'json_schema',
          strict: true,
        }),
      }),
    );
  });

  it('falls back when structured output does not match schema', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: '{"invalid":true}',
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => {
        if (key === 'OPENAI_API_KEY') return 'key';
        if (key === 'OPENAI_TIMEOUT_MS') return 5000;
        if (key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT') return true;
        if (key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT') return 100;
        return 'gpt-4.1-mini';
      },
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('general'));

    expect(resolveMessage(result)).toContain('Perfecto');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function buildInput(
  intent: Parameters<OpenAiAdapter['buildAssistantReply']>[0]['intent'],
): Parameters<OpenAiAdapter['buildAssistantReply']>[0] {
  return {
    requestId: 'req-123',
    conversationId: 'conv-1',
    externalEventId: 'event-1',
    userText: 'hola',
    intent,
    history: [],
    contextBlocks: [],
  };
}

function resolveMessage(result: Awaited<ReturnType<OpenAiAdapter['buildAssistantReply']>>): string {
  return typeof result === 'string' ? result : result.message;
}

function resolvePromptVersion(
  result: Awaited<ReturnType<OpenAiAdapter['buildAssistantReply']>>,
): string | null {
  return typeof result === 'string' ? null : result.metadata?.promptVersion ?? null;
}
