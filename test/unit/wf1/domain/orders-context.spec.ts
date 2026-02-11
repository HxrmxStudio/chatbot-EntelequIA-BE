import {
  buildOrderDetailAiContext,
  buildOrdersListAiContext,
  normalizeOrderState,
} from '@/modules/wf1/domain/orders-context';

describe('Orders Context', () => {
  it('builds order detail context with state, shipping, items and payment', () => {
    const result = buildOrderDetailAiContext({
      order: {
        id: 1001,
        state: 'processing',
        createdAt: '2026-02-10T10:00:00Z',
        total: { currency: 'ARS', amount: 5100 },
        shipMethod: 'Envio - Correo',
        shipTrackingCode: 'ABC123456',
        orderItems: [
          {
            title: 'One Piece 01',
            quantity: 2,
            unitPrice: { currency: 'ARS', amount: 2500 },
          },
        ],
        payment: {
          paymentMethod: 'Mercado Pago',
          status: 'approved',
        },
      },
    });

    expect(result.contextText).toContain('PEDIDO #1001');
    expect(result.contextText).toContain('Estado: En preparacion');
    expect(result.contextText).toContain('Tracking: ABC123456');
    expect(result.contextText).toContain('One Piece 01 - Cantidad: 2 - Precio: $2500 ARS');
    expect(result.contextText).toContain('Metodo: Mercado Pago');
    expect(result.orderId).toBe(1001);
  });

  it('uses safe fallbacks when order detail fields are missing', () => {
    const result = buildOrderDetailAiContext({
      order: {
        id: '1002',
        state: '',
        orderItems: [],
      },
    });

    expect(result.contextText).toContain('Estado: Sin estado');
    expect(result.contextText).toContain('Fecha: No disponible');
    expect(result.contextText).toContain('Total: No disponible');
    expect(result.contextText).toContain('Metodo: No especificado');
    expect(result.contextText).toContain('Tracking: Pendiente');
  });

  it('limits list context to top 3 orders and keeps total count', () => {
    const result = buildOrdersListAiContext({
      orders: [
        { id: 1, state: 'pending', orderItems: [], total: { currency: 'ARS', amount: 1000 } },
        { id: 2, state: 'processing', orderItems: [], total: { currency: 'ARS', amount: 2000 } },
        { id: 3, state: 'shipped', orderItems: [], total: { currency: 'ARS', amount: 3000 } },
        { id: 4, state: 'delivered', orderItems: [], total: { currency: 'ARS', amount: 4000 } },
      ],
      total: 10,
    });

    expect(result.ordersShown).toBe(3);
    expect(result.totalOrders).toBe(10);
    expect(result.contextText).toContain('Mostrando 3 de 10 pedidos');
    expect(result.contextText).toContain('Pedido #1');
    expect(result.contextText).toContain('Pedido #3');
    expect(result.contextText).not.toContain('Pedido #4');
  });

  it('returns empty-message context when there are no orders', () => {
    const result = buildOrdersListAiContext({
      orders: [],
      total: 0,
      templates: {
        emptyMessage: 'No hay pedidos para mostrar.',
      },
    });

    expect(result.ordersShown).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.contextText).toBe('No hay pedidos para mostrar.');
  });

  it('normalizes english and spanish-like state values', () => {
    expect(normalizeOrderState('pending')).toBe('pending');
    expect(normalizeOrderState('en preparacion')).toBe('processing');
    expect(normalizeOrderState('shipped')).toBe('shipped');
    expect(normalizeOrderState('Entregado')).toBe('delivered');
    expect(normalizeOrderState('cancelado')).toBe('cancelled');
    expect(normalizeOrderState('')).toBe('unknown');
  });
});
