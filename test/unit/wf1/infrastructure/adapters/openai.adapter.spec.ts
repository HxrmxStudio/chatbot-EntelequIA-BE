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
    incrementCriticalPolicyContextInjected: jest.fn(),
    incrementCriticalPolicyContextTrimmed: jest.fn(),
    incrementPromptContextTruncated: jest.fn(),
    incrementReturnsPolicyDirectAnswer: jest.fn(),
    incrementPolicyDirectAnswer: jest.fn(),
    incrementScopeRedirect: jest.fn(),
    incrementFeedbackReceived: jest.fn(),
    incrementFeedbackWithCategory: jest.fn(),
    incrementUiPayloadEmitted: jest.fn(),
    incrementUiPayloadSuppressed: jest.fn(),
    incrementLearningAutopromote: jest.fn(),
    incrementLearningAutorollback: jest.fn(),
    incrementExemplarsUsedInPrompt: jest.fn(),
    incrementOpenAiRequest: jest.fn(),
    addOpenAiInputTokens: jest.fn(),
    addOpenAiOutputTokens: jest.fn(),
    addOpenAiCachedTokens: jest.fn(),
    addOpenAiEstimatedCostUsd: jest.fn(),
    incrementEvalBatchSubmitted: jest.fn(),
    incrementEvalBatchCompleted: jest.fn(),
    incrementEvalBatchFailed: jest.fn(),
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
    metricsStub.incrementCriticalPolicyContextInjected.mockReset();
    metricsStub.incrementCriticalPolicyContextTrimmed.mockReset();
    metricsStub.incrementPromptContextTruncated.mockReset();
    metricsStub.incrementReturnsPolicyDirectAnswer.mockReset();
    metricsStub.incrementPolicyDirectAnswer.mockReset();
    metricsStub.incrementScopeRedirect.mockReset();
    metricsStub.incrementFeedbackReceived.mockReset();
    metricsStub.incrementFeedbackWithCategory.mockReset();
    metricsStub.incrementUiPayloadEmitted.mockReset();
    metricsStub.incrementUiPayloadSuppressed.mockReset();
    metricsStub.incrementLearningAutopromote.mockReset();
    metricsStub.incrementLearningAutorollback.mockReset();
    metricsStub.incrementExemplarsUsedInPrompt.mockReset();
    metricsStub.incrementOpenAiRequest.mockReset();
    metricsStub.addOpenAiInputTokens.mockReset();
    metricsStub.addOpenAiOutputTokens.mockReset();
    metricsStub.addOpenAiCachedTokens.mockReset();
    metricsStub.addOpenAiEstimatedCostUsd.mockReset();
    metricsStub.incrementEvalBatchSubmitted.mockReset();
    metricsStub.incrementEvalBatchCompleted.mockReset();
    metricsStub.incrementEvalBatchFailed.mockReset();
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

  it('routes simple intents to economical model', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: 'estado de pedido',
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => {
        if (key === 'OPENAI_API_KEY') return 'key';
        if (key === 'OPENAI_TIMEOUT_MS') return 5000;
        if (key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT') return false;
        if (key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT') return 0;
        if (key === 'OPENAI_MODEL') return 'gpt-4.1-mini';
        return undefined;
      },
    } as ConfigService, metricsStub);

    await adapter.buildAssistantReply(buildInput('orders'));

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body['model']).toBe('gpt-4.1-nano');
  });

  it('escalates from economical model to primary when structured confidence is low', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            reply: 'Necesito mas datos',
            requires_clarification: true,
            clarifying_question: 'me pasas mas contexto?',
            confidence_label: 'low',
            _schema_version: '1.0',
          }),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            reply: 'Respuesta final con modelo principal',
            requires_clarification: false,
            clarifying_question: null,
            confidence_label: 'high',
            _schema_version: '1.0',
          }),
        }),
      });
    global.fetch = fetchMock as typeof fetch;

    const adapter = new OpenAiAdapter({
      get: (key: string) => {
        if (key === 'OPENAI_API_KEY') return 'key';
        if (key === 'OPENAI_TIMEOUT_MS') return 5000;
        if (key === 'WF1_FINAL_REPLY_STRUCTURED_OUTPUT') return true;
        if (key === 'WF1_FINAL_REPLY_ROLLOUT_PERCENT') return 100;
        if (key === 'OPENAI_MODEL') return 'gpt-4.1-mini';
        return undefined;
      },
    } as ConfigService, metricsStub);

    const result = await adapter.buildAssistantReply(buildInput('general'));

    expect(resolveMessage(result)).toBe('Respuesta final con modelo principal');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const firstBody = JSON.parse(String(firstRequest.body)) as Record<string, unknown>;
    const secondBody = JSON.parse(String(secondRequest.body)) as Record<string, unknown>;

    expect(firstBody['model']).toBe('gpt-4.1-nano');
    expect(secondBody['model']).toBe('gpt-4.1-mini');
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
