import {
  canonicalizeOrderState,
  extractOrderDetail,
  extractOrdersList,
  extractOrdersTotal,
  isUnauthenticatedOrdersPayload,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/order-parsers';

describe('order-parsers', () => {
  it('extracts orders list from payload.data', () => {
    const orders = extractOrdersList({
      data: [
        {
          id: 1001,
          state: 'processing',
          created_at: '2026-02-10T10:00:00Z',
          total: { currency: 'ARS', amount: 5100 },
          shipMethod: 'Correo',
          shipTrackingCode: 'TRACK123',
          payment: { payment_method: 'Mercado Pago', status: 'approved' },
          orderItems: [{ quantity: 1, productTitle: 'One Piece', productPrice: { currency: 'ARS', amount: 5100 } }],
        },
      ],
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(1001);
    expect(orders[0].state).toBe('processing');
    expect(orders[0].orderItems).toHaveLength(1);
    expect(orders[0].payment?.paymentMethod).toBe('Mercado Pago');
  });

  it('extracts total from pagination.total or falls back to list length', () => {
    const withPagination = extractOrdersTotal(
      { pagination: { total: 8 } },
      3,
    );
    const withoutPagination = extractOrdersTotal({}, 3);

    expect(withPagination).toBe(8);
    expect(withoutPagination).toBe(3);
  });

  it('extracts order detail from payload.order wrapper', () => {
    const detail = extractOrderDetail({
      order: {
        id: 'A100',
        state: 'pending',
        orderItems: [{ quantity: 2, title: 'Item', price: { currency: 'ARS', amount: 1000 } }],
      },
    });

    expect(detail).not.toBeNull();
    expect(detail?.id).toBe('A100');
    expect(detail?.orderItems[0].quantity).toBe(2);
    expect(detail?.stateRaw).toBe('pending');
    expect(detail?.stateCanonical).toBe('pending');
  });

  it('extracts state using explicit precedence state -> status -> order_status -> shipping_status', () => {
    const detail = extractOrderDetail({
      order: {
        id: 77,
        status: 'processing',
        order_status: 'cancelled',
        shipping_status: 'shipped',
      },
    });

    expect(detail?.stateRaw).toBe('processing');
    expect(detail?.stateCanonical).toBe('processing');
  });

  it('marks ambiguous mixed state text as unknown canonical state', () => {
    expect(canonicalizeOrderState('cancelado y en preparacion')).toBe('unknown');
  });

  it('detects legacy unauthenticated payload shape', () => {
    expect(isUnauthenticatedOrdersPayload({ message: 'Unauthenticated.' })).toBe(true);
    expect(isUnauthenticatedOrdersPayload({ error: 'Unauthenticated.' })).toBe(true);
    expect(isUnauthenticatedOrdersPayload({ message: 'ok' })).toBe(false);
  });

  it('detects token/session unauthorized variants', () => {
    expect(isUnauthenticatedOrdersPayload({ message: 'Unauthorized' })).toBe(true);
    expect(isUnauthenticatedOrdersPayload({ error: 'Token expired' })).toBe(true);
    expect(isUnauthenticatedOrdersPayload({ error: 'jwt expired' })).toBe(true);
    expect(isUnauthenticatedOrdersPayload({ message: 'session expired' })).toBe(true);
  });
});
