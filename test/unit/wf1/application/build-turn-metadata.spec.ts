import { buildSharedTurnMetadata } from '@/modules/wf1/application/use-cases/handle-incoming-message/support/build-turn-metadata';

describe('buildSharedTurnMetadata', () => {
  const baseInput = {
    routedIntent: 'general',
    predictedConfidence: 0.9,
    predictedEntitiesCount: 2,
    sentiment: 'neutral',
    llmMetadata: undefined,
    contextTypes: ['general'],
    conversationId: 'conv-1',
    requestId: 'req-1',
    externalEventId: 'evt-1234567890123456',
    discloseExactStock: false,
    storeInfoSubtype: null,
    storeInfoPolicyVersion: null,
    uiPayloadVersion: null,
    uiKind: null,
    uiCardsCount: 0,
    uiCardsWithImageCount: 0,
    guestOrderFlowMetadata: {},
    recommendationsFlowMetadata: {},
    recommendationsMemoryMetadata: {},
    ordersEscalationFlowMetadata: {},
    authPresent: false,
    llmAttempts: 1,
    toolAttempts: 1,
    pipelineFallbackCount: 0,
    pipelineFallbackReasons: [],
    intentRescuedTo: null,
    intentRescueReason: null,
    ordersDataSource: null,
    orderIdResolved: null,
    orderStateRaw: null,
    orderStateCanonical: null,
    ordersStateConflict: false,
    ordersDeterministicReply: false,
  };

  it('includes policy version and fallback llm path', () => {
    const out = buildSharedTurnMetadata(baseInput);
    expect(out.responsePolicyVersion).toBe('v2-banded-stock');
    expect(out.llmPath).toBe('fallback_default');
    expect(out.lowStockThreshold).toBe(3);
    expect(out.ordersDeterministicReply).toBe(false);
    expect(out.ordersStateConflict).toBe(false);
  });

  it('uses llmMetadata when provided', () => {
    const out = buildSharedTurnMetadata({
      ...baseInput,
      llmMetadata: {
        llmPath: 'structured_success',
      },
    });
    expect(out.llmPath).toBe('structured_success');
  });

  it('includes trace fields from request', () => {
    const out = buildSharedTurnMetadata(baseInput);
    expect(out.sessionId).toBe('conv-1');
    expect(out.traceId).toBe('req-1');
    expect(out.spanId).toBe('evt-123456789012');
  });

  it('merges flow metadata into result', () => {
    const out = buildSharedTurnMetadata({
      ...baseInput,
      guestOrderFlowMetadata: { ordersGuestFlowState: 'awaiting_lookup_payload' },
    });
    expect(out.ordersGuestFlowState).toBe('awaiting_lookup_payload');
  });
});
