import { resolveOrderLookupRequest } from '@/modules/wf1/application/use-cases/handle-incoming-message/resolve-order-lookup-request';

describe('resolveOrderLookupRequest', () => {
  it('extracts order_id and identity factors from labeled message', () => {
    const result = resolveOrderLookupRequest({
      text: 'pedido 12345, dni 12.345.678, nombre Juan, apellido Perez, telefono +54 11 4444 5555',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.identity).toEqual({
      dni: '12345678',
      name: 'Juan',
      lastName: 'Perez',
      phone: '+54 11 4444 5555',
    });
    expect(result.providedFactors).toBe(4);
  });

  it('extracts order id from order_id keyword', () => {
    const result = resolveOrderLookupRequest({
      text: 'order_id: 50110, dni: 12345678, phone: 11-4444-5555',
      entities: [],
    });

    expect(result.orderId).toBe(50110);
    expect(result.providedFactors).toBe(2);
    expect(result.identity).toEqual({
      dni: '12345678',
      phone: '11-4444-5555',
    });
  });

  it('returns undefined orderId when no valid order reference exists', () => {
    const result = resolveOrderLookupRequest({
      text: 'quiero saber estado, dni 12345678, telefono 1144445555',
      entities: [],
    });

    expect(result.orderId).toBeUndefined();
    expect(result.providedFactors).toBe(2);
  });

  it('counts provided factors correctly when only one is present', () => {
    const result = resolveOrderLookupRequest({
      text: 'pedido 12345, dni 12345678',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.providedFactors).toBe(1);
    expect(result.identity).toEqual({
      dni: '12345678',
    });
  });

  it('accepts full-text numeric message as order id', () => {
    const result = resolveOrderLookupRequest({
      text: '12345',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.providedFactors).toBe(0);
  });
});
