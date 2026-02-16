import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import { resolveOrdersDetailFollowup } from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/orders/resolve-orders-detail-followup';

describe('resolve-orders-detail-followup', () => {
  it('detects items follow-up and reuses latest resolved order id from history', () => {
    const historyRows: ConversationHistoryRow[] = [
      buildBotRow({
        orderIdResolved: '78399',
        ordersDeterministicReply: true,
      }),
      buildBotRow({
        orderIdResolved: '70000',
        ordersDeterministicReply: true,
      }),
    ];

    const result = resolveOrdersDetailFollowup({
      text: 'que tenia ese pedido?',
      historyRows,
      explicitOrderId: null,
    });

    expect(result.includeOrderItems).toBe(true);
    expect(result.resolvedOrderId).toBe('78399');
    expect(result.resolvedFromHistory).toBe(true);
  });

  it('does not reuse order id for plural list requests', () => {
    const historyRows: ConversationHistoryRow[] = [
      buildBotRow({
        orderIdResolved: '78399',
        ordersDeterministicReply: true,
      }),
    ];

    const result = resolveOrdersDetailFollowup({
      text: 'mostrame mis pedidos',
      historyRows,
      explicitOrderId: null,
    });

    expect(result.includeOrderItems).toBe(false);
    expect(result.resolvedOrderId).toBeNull();
    expect(result.resolvedFromHistory).toBe(false);
  });

  it('does not reuse order id when there is no useful history', () => {
    const result = resolveOrdersDetailFollowup({
      text: 'que tenia ese pedido?',
      historyRows: [],
      explicitOrderId: null,
    });

    expect(result.includeOrderItems).toBe(true);
    expect(result.resolvedOrderId).toBeNull();
    expect(result.resolvedFromHistory).toBe(false);
  });

  it('keeps explicit order id when provided in text', () => {
    const result = resolveOrdersDetailFollowup({
      text: 'que tenia el pedido 78399?',
      historyRows: [],
      explicitOrderId: '78399',
    });

    expect(result.includeOrderItems).toBe(true);
    expect(result.resolvedOrderId).toBe('78399');
    expect(result.resolvedFromHistory).toBe(false);
  });
});

function buildBotRow(metadata: Record<string, unknown>): ConversationHistoryRow {
  return {
    id: '1',
    content: 'pedido',
    sender: 'bot',
    type: 'text',
    channel: 'web',
    metadata,
    created_at: '2026-02-15T00:00:00.000Z',
  };
}
