import {
  resolveCancelledOrderEscalationAnswer,
  resolveOrdersEscalationFlowStateFromHistory,
  resolveRecentCancelledOrderId,
  shouldContinueOrdersEscalationFlow,
  shouldSuggestCancelledOrderEscalation,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/resolve-orders-escalation-flow-state';

describe('resolve-orders-escalation-flow-state', () => {
  it('resolves latest escalation state from bot metadata', () => {
    const state = resolveOrdersEscalationFlowStateFromHistory([
      {
        id: '1',
        content: 'mensaje',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: { ordersEscalationFlowState: 'awaiting_cancelled_reason_confirmation' },
        created_at: '2026-02-12T10:00:01.000Z',
      },
    ]);

    expect(state).toBe('awaiting_cancelled_reason_confirmation');
  });

  it('parses yes/no confirmations with rioplatense variants', () => {
    expect(resolveCancelledOrderEscalationAnswer('si por favor')).toBe('yes');
    expect(resolveCancelledOrderEscalationAnswer('dale')).toBe('yes');
    expect(resolveCancelledOrderEscalationAnswer('no gracias')).toBe('no');
    expect(resolveCancelledOrderEscalationAnswer('capaz despues')).toBe('unknown');
  });

  it('continues pending flow only on clear confirmations or escalation intent', () => {
    expect(
      shouldContinueOrdersEscalationFlow({
        currentFlowState: 'awaiting_cancelled_reason_confirmation',
        text: 'si por favor',
        routedIntent: 'general',
      }),
    ).toBe(true);

    expect(
      shouldContinueOrdersEscalationFlow({
        currentFlowState: 'awaiting_cancelled_reason_confirmation',
        text: 'consulta eso porfa',
        routedIntent: 'tickets',
      }),
    ).toBe(true);

    expect(
      shouldContinueOrdersEscalationFlow({
        currentFlowState: 'awaiting_cancelled_reason_confirmation',
        text: 'tenes mangas de evangelion?',
        routedIntent: 'products',
      }),
    ).toBe(false);
  });

  it('extracts cancelled order id from latest bot history messages', () => {
    const orderId = resolveRecentCancelledOrderId([
      {
        id: '2',
        content: 'El pedido #78399 esta cancelado.',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-12T10:00:02.000Z',
      },
      {
        id: '1',
        content: 'El pedido #78398 esta cancelado.',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: null,
        created_at: '2026-02-12T10:00:01.000Z',
      },
    ]);

    expect(orderId).toBe('78399');
  });

  it('detects cancelled-order consult prompts to persist pending escalation state', () => {
    expect(
      shouldSuggestCancelledOrderEscalation(
        'No me figura el motivo de la cancelacion. Queres que consulte con el area correspondiente?',
      ),
    ).toBe(true);
    expect(shouldSuggestCancelledOrderEscalation('Te paso el estado del pedido.')).toBe(false);
  });
});
