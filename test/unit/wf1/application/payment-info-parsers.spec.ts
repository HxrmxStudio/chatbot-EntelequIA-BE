import {
  extractPaymentMethods,
  extractPromotions,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/payment-info-parsers';

describe('payment-info-parsers', () => {
  it('extracts payment methods from mixed list of strings and objects', () => {
    const paymentMethods = extractPaymentMethods({
      payment_methods: [
        'Mercado Pago',
        { name: 'Tarjetas de credito' },
        { label: 'Transferencia bancaria' },
      ],
    });

    expect(paymentMethods).toEqual([
      'Mercado Pago',
      'Tarjetas de credito',
      'Transferencia bancaria',
    ]);
  });

  it('extracts promotions from object list with label/title/description', () => {
    const promotions = extractPromotions({
      promotions: [
        { label: 'Cuotas sin interes' },
        { title: 'Promo bancaria' },
        { description: 'Descuento por transferencia' },
      ],
    });

    expect(promotions).toEqual([
      'Cuotas sin interes',
      'Promo bancaria',
      'Descuento por transferencia',
    ]);
  });

  it('returns empty arrays when payload has no valid list', () => {
    expect(extractPaymentMethods({})).toEqual([]);
    expect(extractPromotions({ promotions: 'invalid' })).toEqual([]);
  });
});
