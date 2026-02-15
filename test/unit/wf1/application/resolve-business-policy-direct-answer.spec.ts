import { resolveBusinessPolicyDirectAnswer } from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/policy/resolve-business-policy-direct-answer';

describe('resolve-business-policy-direct-answer', () => {
  it('returns deterministic returns policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'cuanto tiempo tengo para devolver un producto?',
    );

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('returns');
    expect(result?.intent).toBe('tickets');
    expect(result?.message).toContain('30 dias corridos');
  });

  it('returns reservations policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer('se puede reservar articulos?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('reservations');
    expect(result?.intent).toBe('products');
    expect(result?.message).toContain('48 horas');
  });

  it('returns imports policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'traen productos importados bajo pedido?',
    );

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('imports');
    expect(result?.message).toContain('30 a 60 dias');
  });

  it('returns editorials policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer('que editoriales trabajan?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('editorials');
    expect(result?.message).toContain('Ivrea');
  });

  it('returns promotions policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer('que promociones tienen vigentes?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('promotions');
    expect(result?.intent).toBe('payment_shipping');
  });

  it('returns international shipping policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'hacen envios internacionales con dhl?',
    );

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('international_shipping');
    expect(result?.intent).toBe('payment_shipping');
  });

  it('returns international shipping for "hacen envios al exterior" (not imports)', () => {
    const result = resolveBusinessPolicyDirectAnswer('hacen envios al exterior?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('international_shipping');
    expect(result?.intent).toBe('payment_shipping');
  });

  it('returns shipping_cost policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer('cuanto cuesta el envio?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('shipping_cost');
    expect(result?.intent).toBe('payment_shipping');
    expect(result?.message).toContain('checkout');
  });

  it('returns pickup_store policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer('puedo retirar en sucursal?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('pickup_store');
    expect(result?.intent).toBe('payment_shipping');
    expect(result?.message).toContain('sucursal');
  });

  it('returns store_hours policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer('que horario tienen hoy?');

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('store_hours');
    expect(result?.intent).toBe('store_info');
    expect(result?.message).toContain('horarios');
  });

  it('returns payment_methods policy answer', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'que medios de pago aceptan en local?',
    );

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('payment_methods');
    expect(result?.intent).toBe('store_info');
  });

  it('returns returns policy for typo "devoluvion" with detail terms', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'cual es la politica de devoluvion?',
    );

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('returns');
    expect(result?.intent).toBe('tickets');
  });

  it('returns returns policy for typo "canbio" with detail terms', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'cuanto tiempo tengo para hacer un canbio?',
    );

    expect(result).toBeTruthy();
    expect(result?.policyType).toBe('returns');
  });

  it('returns null for returns with order ID (case management)', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'quiero cambiar mi pedido 78399',
    );

    expect(result).toBeNull();
  });

  it('returns null for returns case management terms', () => {
    const result = resolveBusinessPolicyDirectAnswer(
      'quiero iniciar una devolucion de este pedido',
    );

    expect(result).toBeNull();
  });

  it('does not match shipping_cost for product price query', () => {
    const result = resolveBusinessPolicyDirectAnswer('cuanto sale el evangelion?');

    expect(result).toBeNull();
  });

  it('returns null for unrelated text', () => {
    const result = resolveBusinessPolicyDirectAnswer('hola, como va?');

    expect(result).toBeNull();
  });
});
