import {
  isShortIsolatedOrderAck,
  resolveGuestOrderFlowStateFromHistory,
  resolveOrderDataAnswerStrength,
  resolveHasOrderDataAnswer,
  shouldContinueGuestOrderLookupFlow,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/orders/resolve-order-lookup-flow-state';

describe('resolve-order-lookup-flow-state', () => {
  it('resolves latest guest flow state from bot metadata', () => {
    const state = resolveGuestOrderFlowStateFromHistory([
      {
        id: '1',
        content: 'mensaje',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: { ordersGuestFlowState: 'awaiting_lookup_payload' },
        created_at: '2026-02-12T10:00:01.000Z',
      },
      {
        id: '2',
        content: 'anterior',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: { ordersGuestFlowState: 'awaiting_has_data_answer' },
        created_at: '2026-02-12T09:59:59.000Z',
      },
    ]);

    expect(state).toBe('awaiting_lookup_payload');
  });

  it('treats explicit null state as cleared', () => {
    const state = resolveGuestOrderFlowStateFromHistory([
      {
        id: '1',
        content: 'mensaje',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: { ordersGuestFlowState: null },
        created_at: '2026-02-12T10:00:01.000Z',
      },
      {
        id: '2',
        content: 'anterior',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: { ordersGuestFlowState: 'awaiting_lookup_payload' },
        created_at: '2026-02-12T09:59:59.000Z',
      },
    ]);

    expect(state).toBeNull();
  });

  it('parses yes/no answers with flexible variants', () => {
    expect(resolveHasOrderDataAnswer('si, los tengo')).toBe('yes');
    expect(resolveHasOrderDataAnswer('de una')).toBe('yes');
    expect(resolveHasOrderDataAnswer('dale')).toBe('yes');
    expect(resolveHasOrderDataAnswer('No tengo esos datos')).toBe('no');
    expect(resolveHasOrderDataAnswer('ni en pedo')).toBe('no');
    expect(resolveHasOrderDataAnswer('no estoy ni ahi')).toBe('no');
    expect(resolveHasOrderDataAnswer('siiiii')).toBe('yes');
    expect(resolveHasOrderDataAnswer('nooo')).toBe('no');
    expect(resolveHasOrderDataAnswer('capaz')).toBe('unknown');
    expect(resolveHasOrderDataAnswer('no se')).toBe('unknown');
  });

  it('continues pending flow for explicit answers', () => {
    expect(
      shouldContinueGuestOrderLookupFlow({
        currentFlowState: 'awaiting_has_data_answer',
        text: 'si',
        entities: [],
        routedIntent: 'general',
      }),
    ).toBe(true);

    expect(
      shouldContinueGuestOrderLookupFlow({
        currentFlowState: 'awaiting_lookup_payload',
        text: 'no',
        entities: [],
        routedIntent: 'products',
      }),
    ).toBe(true);
  });

  it('continues pending flow for lookup payload signals', () => {
    expect(
      shouldContinueGuestOrderLookupFlow({
        currentFlowState: 'awaiting_lookup_payload',
        text: 'pedido 12345, dni 12345678',
        entities: [],
        routedIntent: 'products',
      }),
    ).toBe(true);
  });

  it('continues pending flow when lookup contains invalid factor formats', () => {
    expect(
      shouldContinueGuestOrderLookupFlow({
        currentFlowState: 'awaiting_lookup_payload',
        text: 'pedido 12345, dni 123',
        entities: [],
        routedIntent: 'general',
      }),
    ).toBe(true);
  });

  it('does not continue guest order flow for weak yes mixed with another intent', () => {
    expect(
      shouldContinueGuestOrderLookupFlow({
        currentFlowState: 'awaiting_has_data_answer',
        text: 'dale, tenes el nro 1 de evangelion?',
        entities: [],
        routedIntent: 'products',
      }),
    ).toBe(false);
  });

  it('does not continue pending flow on irrelevant text', () => {
    expect(
      shouldContinueGuestOrderLookupFlow({
        currentFlowState: 'awaiting_lookup_payload',
        text: 'gracias por la ayuda',
        entities: [],
        routedIntent: 'general',
      }),
    ).toBe(false);
  });

  it('classifies answer strengths for rioplatense variants', () => {
    expect(resolveOrderDataAnswerStrength('dale')).toBe('weak_yes');
    expect(resolveOrderDataAnswerStrength('de una')).toBe('strong_yes');
    expect(resolveOrderDataAnswerStrength('ni en pedo')).toBe('strong_no');
    expect(resolveOrderDataAnswerStrength('puede ser')).toBe('ambiguous');
  });

  it('detects short isolated acknowledgments only when standalone', () => {
    expect(isShortIsolatedOrderAck('dale')).toBe(true);
    expect(isShortIsolatedOrderAck('de una')).toBe(true);
    expect(isShortIsolatedOrderAck('dale, tenes el nro 1')).toBe(false);
  });
});
