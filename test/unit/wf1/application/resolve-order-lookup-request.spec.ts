import { resolveOrderLookupRequest } from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/orders/resolve-order-lookup-request';

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
      phone: '+541144445555',
    });
    expect(result.providedFactors).toBe(4);
    expect(result.invalidFactors).toEqual([]);
  });

  it('prioritizes labeled order_id in text over numeric entities like dni', () => {
    const result = resolveOrderLookupRequest({
      text: 'pedido 12345, dni 12345678, nombre Juan, apellido Perez',
      entities: ['12345678', 'Juan', 'Perez'],
    });

    expect(result.orderId).toBe(12345);
    expect(result.identity).toEqual({
      dni: '12345678',
      name: 'Juan',
      lastName: 'Perez',
    });
    expect(result.providedFactors).toBe(3);
    expect(result.invalidFactors).toEqual([]);
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
      phone: '1144445555',
    });
    expect(result.invalidFactors).toEqual([]);
  });

  it('returns undefined orderId when no valid order reference exists', () => {
    const result = resolveOrderLookupRequest({
      text: 'quiero saber estado, dni 12345678, telefono 1144445555',
      entities: [],
    });

    expect(result.orderId).toBeUndefined();
    expect(result.providedFactors).toBe(2);
    expect(result.invalidFactors).toEqual([]);
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
    expect(result.invalidFactors).toEqual([]);
  });

  it('accepts full-text numeric message as order id', () => {
    const result = resolveOrderLookupRequest({
      text: '12345',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.providedFactors).toBe(0);
    expect(result.invalidFactors).toEqual([]);
  });

  it('extracts unlabeled order payload values from compact messages', () => {
    const result = resolveOrderLookupRequest({
      text: '#78399, 627149803, emiliano rozas',
      entities: [],
    });

    expect(result.orderId).toBe(78399);
    expect(result.providedFactors).toBe(3);
    expect(result.identity).toEqual({
      phone: '627149803',
      name: 'emiliano',
      lastName: 'rozas',
    });
    expect(result.invalidFactors).toEqual([]);
  });

  it('extracts identity factors from multiline payload preserving line breaks', () => {
    const result = resolveOrderLookupRequest({
      text: 'Pedido #78399\ndni:38321532\nEmiliano rozas',
      entities: [],
    });

    expect(result.orderId).toBe(78399);
    expect(result.providedFactors).toBe(3);
    expect(result.identity).toEqual({
      dni: '38321532',
      name: 'Emiliano',
      lastName: 'rozas',
    });
    expect(result.invalidFactors).toEqual([]);
  });

  it('extracts trailing full name from partially labeled single-line payload', () => {
    const result = resolveOrderLookupRequest({
      text: 'Pedido #78399 dni:38321532 Emiliano rozas',
      entities: [],
    });

    expect(result.orderId).toBe(78399);
    expect(result.providedFactors).toBeGreaterThanOrEqual(2);
    expect(result.identity).toEqual({
      dni: '38321532',
      name: 'Emiliano',
      lastName: 'rozas',
    });
    expect(result.invalidFactors).toEqual([]);
  });

  it('reports invalid factors when formats are incorrect', () => {
    const result = resolveOrderLookupRequest({
      text: 'pedido 12345, dni 123, nombre Ju4n, telefono abcdef',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.providedFactors).toBe(0);
    expect(result.identity).toEqual({});
    expect(result.invalidFactors).toEqual(['dni', 'name']);
  });

  it('parses names with 3+ words (first word as name, rest as lastName)', () => {
    const result = resolveOrderLookupRequest({
      text: 'pedido 12345, dni 12345678, juan pablo garcia',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.providedFactors).toBe(3);
    expect(result.identity).toEqual({
      dni: '12345678',
      name: 'juan',
      lastName: 'pablo garcia',
    });
    expect(result.invalidFactors).toEqual([]);
  });

  it('rejects phone values outside expected range', () => {
    const result = resolveOrderLookupRequest({
      text: 'pedido 12345, dni 12345678, telefono 123',
      entities: [],
    });

    expect(result.orderId).toBe(12345);
    expect(result.providedFactors).toBe(1);
    expect(result.identity).toEqual({
      dni: '12345678',
    });
    expect(result.invalidFactors).toEqual(['phone']);
  });
});
