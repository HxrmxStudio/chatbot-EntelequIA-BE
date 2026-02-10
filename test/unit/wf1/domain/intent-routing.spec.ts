import { resolveIntentRoute, resolveIntentRouteStrict } from '@/modules/wf1/domain/intent-routing';

describe('Intent routing (Switch)', () => {
  it('routes known intents exactly', () => {
    expect(resolveIntentRoute('products')).toBe('products');
    expect(resolveIntentRoute('orders')).toBe('orders');
    expect(resolveIntentRoute('tickets')).toBe('tickets');
    expect(resolveIntentRoute('store_info')).toBe('store_info');
    expect(resolveIntentRoute('payment_shipping')).toBe('payment_shipping');
    expect(resolveIntentRoute('recommendations')).toBe('recommendations');
    expect(resolveIntentRoute('general')).toBe('general');
  });

  it('routes with trim normalization to avoid whitespace drops', () => {
    expect(resolveIntentRoute(' tickets')).toBe('tickets');
    expect(resolveIntentRoute('tickets ')).toBe('tickets');
  });

  it('falls back to general on unknown values', () => {
    expect(resolveIntentRoute('unknown')).toBe('general');
    expect(resolveIntentRoute(null)).toBe('general');
    expect(resolveIntentRoute(1)).toBe('general');
  });

  it('strict routing matches n8n drop semantics', () => {
    expect(resolveIntentRouteStrict('tickets')).toBe('tickets');
    expect(resolveIntentRouteStrict(' tickets')).toBeNull();
    expect(resolveIntentRouteStrict('unknown')).toBeNull();
    expect(resolveIntentRouteStrict(null)).toBeNull();
  });
});
