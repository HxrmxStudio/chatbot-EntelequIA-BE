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
    expect(result.response.message.toLowerCase()).not.toContain('productos del pedido');
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

  it('renders order items only when explicitly requested', () => {
    const result = formatDeterministicOrdersResponse({
      conversationId: 'conv-1',
      includeOrderItems: true,
      contextBlocks: [
        {
          contextType: 'order_detail',
          contextPayload: {
            order: {
              id: 78399,
              state: 'processing',
              orderItems: [
                {
                  productTitle: 'One Piece 01',
                  quantity: 2,
                  productPrice: {
                    amount: 12000,
                    currency: 'ARS',
                  },
                },
              ],
            },
            orderStateRaw: 'processing',
            orderStateCanonical: 'processing',
            ordersStateConflict: false,
          },
        },
      ],
      requestedOrderId: '78399',
    });

    expect(result.response.message).toContain('Productos del pedido:');
    expect(result.response.message).toContain('- One Piece 01 x2 - $12000 ARS');
  });

  it('caps rendered order items and adds overflow line', () => {
    const orderItems = Array.from({ length: 6 }, (_, index) => ({
      productTitle: `Item ${index + 1}`,
      quantity: 1,
      productPrice: {
        amount: 1000 + index,
        currency: 'ARS',
      },
    }));

    const result = formatDeterministicOrdersResponse({
      conversationId: 'conv-1',
      includeOrderItems: true,
      orderItemsMax: 5,
      contextBlocks: [
        {
          contextType: 'order_detail',
          contextPayload: {
            order: {
              id: 78399,
              state: 'processing',
              orderItems,
            },
            orderStateRaw: 'processing',
            orderStateCanonical: 'processing',
          },
        },
      ],
      requestedOrderId: '78399',
    });

    expect(result.response.message).toContain('- Item 5 x1 - $1004 ARS');
    expect(result.response.message).toContain('... y 1 mas.');
    expect(result.response.message).not.toContain('- Item 6 x1 - $1005 ARS');
  });

  it('keeps conservative conflict state message and appends items with disclaimer', () => {
    const result = formatDeterministicOrdersResponse({
      conversationId: 'conv-1',
      includeOrderItems: true,
      contextBlocks: [
        {
          contextType: 'order_detail',
          contextPayload: {
            order: {
              id: 78399,
              state: 'processing',
              orderItems: [
                {
                  productTitle: 'Naruto 01',
                  quantity: 1,
                  productPrice: {
                    amount: 9000,
                    currency: 'ARS',
                  },
                },
              ],
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

    expect(result.response.message.toLowerCase()).toContain('inconsistencia temporal');
    expect(result.response.message).toContain('Segun el detalle actual del pedido, los productos son:');
    expect(result.response.message).toContain('- Naruto 01 x1 - $9000 ARS');
  });
});
