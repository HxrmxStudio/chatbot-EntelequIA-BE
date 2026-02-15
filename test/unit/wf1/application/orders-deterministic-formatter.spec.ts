import { formatDeterministicOrdersResponse } from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/orders/orders-deterministic-formatter';

describe('orders-deterministic-formatter', () => {
  it('builds deterministic detail response without inferred ETA', () => {
    const result = formatDeterministicOrdersResponse({
      conversationId: 'conv-1',
      contextBlocks: [
        {
          contextType: 'order_detail',
          contextPayload: {
            order: {
              id: 78399,
              state: 'processing',
              shipTrackingCode: 'TRACK-1',
              orderItems: [],
            },
            orderStateRaw: 'processing',
            orderStateCanonical: 'processing',
            ordersStateConflict: false,
          },
        },
      ],
      requestedOrderId: '78399',
    });

    expect(result.response.ok).toBe(true);
    expect(result.ordersDeterministicReply).toBe(true);
    expect(result.ordersDataSource).toBe('detail');
    expect(result.response.message.toLowerCase()).toContain('pedido #78399');
    expect(result.response.message.toLowerCase()).not.toContain('24-48');
  });

  it('returns conservative response when detail/list states conflict', () => {
    const result = formatDeterministicOrdersResponse({
      conversationId: 'conv-1',
      contextBlocks: [
        {
          contextType: 'order_detail',
          contextPayload: {
            order: {
              id: 78399,
              state: 'processing',
              orderItems: [],
            },
            orderStateRaw: 'processing',
            orderStateCanonical: 'processing',
            orderListStateRaw: 'cancelled',
            orderListStateCanonical: 'cancelled',
            ordersStateConflict: true,
          },
        },
      ],
      requestedOrderId: '78399',
    });

    expect(result.ordersDataSource).toBe('conflict');
    expect(result.ordersStateConflict).toBe(true);
    expect(result.response.message.toLowerCase()).toContain('inconsistencia temporal');
    expect(result.response.message.toLowerCase()).toContain('para evitar informarte un estado incorrecto');
  });
});
