import {
  shouldGuideOrdersReauthentication,
  shouldRescueOrdersIntent,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/support/resolve-orders-authenticated-intent';

describe('resolve-orders-authenticated-intent', () => {
  it('rescues orders intent when authenticated user asks for order status with general routing', () => {
    const result = shouldRescueOrdersIntent({
      accessToken: 'token-123',
      routedIntent: 'general',
      text: 'ya me logie, quiero ver mis pedidos',
      entities: [],
    });

    expect(result.shouldRescue).toBe(true);
    expect(result.reason).toBe('authenticated_orders_signal');
  });

  it('rescues orders intent when payload includes order lookup factors', () => {
    const result = shouldRescueOrdersIntent({
      accessToken: 'token-123',
      routedIntent: 'products',
      text: 'pedido 12345, dni 12345678',
      entities: [],
    });

    expect(result.shouldRescue).toBe(true);
    expect(result.reason).toBe('authenticated_orders_signal');
  });

  it('does not rescue when user is not authenticated', () => {
    const result = shouldRescueOrdersIntent({
      accessToken: undefined,
      routedIntent: 'general',
      text: 'quiero ver mis pedidos',
      entities: [],
    });

    expect(result.shouldRescue).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('detects session continuity signal without token to guide re-authentication', () => {
    const shouldGuide = shouldGuideOrdersReauthentication({
      accessToken: undefined,
      text: 'ya me logue pero no veo mis pedidos',
    });

    expect(shouldGuide).toBe(true);
  });

  it('rescues orders intent when user asks for order contents', () => {
    const result = shouldRescueOrdersIntent({
      accessToken: 'token-123',
      routedIntent: 'general',
      text: 'que tenia ese pedido?',
      entities: [],
    });

    expect(result.shouldRescue).toBe(true);
    expect(result.reason).toBe('authenticated_orders_signal');
  });
});
