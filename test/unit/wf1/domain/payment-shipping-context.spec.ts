import { buildPaymentShippingAiContext } from '@/modules/wf1/domain/payment-shipping-context';

describe('PaymentShippingContext', () => {
  it('builds payment context with dynamic methods and promotions', () => {
    const result = buildPaymentShippingAiContext({
      queryType: 'payment',
      paymentMethods: ['Mercado Pago', 'Tarjetas de credito'],
      promotions: ['Hasta 6 cuotas sin interes'],
      apiFallback: false,
    });

    expect(result.queryType).toBe('payment');
    expect(result.paymentMethods).toEqual(['Mercado Pago', 'Tarjetas de credito']);
    expect(result.promotions).toEqual(['Hasta 6 cuotas sin interes']);
    expect(result.contextText).toContain('MEDIOS DE PAGO');
    expect(result.contextText).toContain('Metodos disponibles:');
    expect(result.contextText).toContain('Promociones vigentes:');
  });

  it('builds cost context without hardcoded numeric shipping amounts', () => {
    const result = buildPaymentShippingAiContext({
      queryType: 'cost',
      paymentMethods: [],
      promotions: [],
      apiFallback: false,
    });

    expect(result.contextText).toContain('COSTOS DE ENVIO');
    expect(result.contextText).toContain('checkout');
    expect(result.contextText).not.toContain('$1000');
    expect(result.contextText).not.toContain('$1500');
  });

  it('adds fallback note when API is unavailable', () => {
    const result = buildPaymentShippingAiContext({
      queryType: 'general',
      paymentMethods: [],
      promotions: [],
      apiFallback: true,
    });

    expect(result.apiFallback).toBe(true);
    expect(result.contextText).toContain('No pude validar promociones en tiempo real');
  });

  it('does not duplicate static-context business strings', () => {
    const result = buildPaymentShippingAiContext({
      queryType: 'shipping',
      apiFallback: false,
    });

    expect(result.contextText).not.toContain('Uruguay 341');
    expect(result.contextText).not.toContain('+54 9 11 6189-8533');
    expect(result.contextText).not.toContain('info@entelequia.com.ar');
  });

  it('uses canonical shipping ranges for time queries', () => {
    const result = buildPaymentShippingAiContext({
      queryType: 'time',
      apiFallback: false,
    });

    expect(result.contextText).toContain('24-48');
    expect(result.contextText).toContain('3-5');
    expect(result.contextText).toContain('5-7');
    expect(result.contextText).toContain('DHL');
    expect(result.contextText).not.toContain('1-3');
    expect(result.contextText).not.toContain('2-5');
  });
});
