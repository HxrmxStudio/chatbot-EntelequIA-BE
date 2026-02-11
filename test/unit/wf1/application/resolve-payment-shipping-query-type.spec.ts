import { resolvePaymentShippingQueryType } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolvePaymentShippingQueryType', () => {
  it('detects payment queries in rioplatense spanish', () => {
    expect(resolvePaymentShippingQueryType('¿Que medios de pago tienen?')).toBe('payment');
    expect(resolvePaymentShippingQueryType('¿Tienen cuotas con Mercado Pago?')).toBe('payment');
  });

  it('detects shipping queries', () => {
    expect(resolvePaymentShippingQueryType('¿Puedo retirar sin cargo?')).toBe('shipping');
    expect(resolvePaymentShippingQueryType('¿Me lo envian por correo?')).toBe('shipping');
  });

  it('prioritizes cost over generic shipping words', () => {
    expect(resolvePaymentShippingQueryType('¿Cuanto sale el envio?')).toBe('cost');
    expect(resolvePaymentShippingQueryType('¿Hay envio gratis?')).toBe('cost');
  });

  it('detects delivery time queries', () => {
    expect(resolvePaymentShippingQueryType('¿Cuanto tarda en llegar?')).toBe('time');
    expect(resolvePaymentShippingQueryType('¿Cual es el tiempo de entrega?')).toBe('time');
  });

  it('falls back to general when no specific hints are present', () => {
    expect(resolvePaymentShippingQueryType('Tengo una duda de compra')).toBe('general');
  });
});
