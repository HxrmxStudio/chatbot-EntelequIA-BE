import {
  buildOrdersRequiresAuthResponse,
  buildOrdersSessionExpiredResponse,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/responses/orders/orders-unauthenticated-response';

describe('orders-unauthenticated-response', () => {
  it('builds requires-auth response with enriched guidance for missing login', () => {
    const response = buildOrdersRequiresAuthResponse();

    expect(response.ok).toBe(false);
    expect('requiresAuth' in response && response.requiresAuth).toBe(true);
    expect(response.message).toContain('NECESITAS INICIAR SESION');
    expect(response.message).toContain('Inicia sesion en entelequia.com.ar');
    expect(response.message).toContain('info@entelequia.com.ar');
    expect(response.message).toContain('No compartas credenciales en el chat');
  });

  it('builds requires-auth response with session-expired headline', () => {
    const response = buildOrdersSessionExpiredResponse();

    expect(response.ok).toBe(false);
    expect('requiresAuth' in response && response.requiresAuth).toBe(true);
    expect(response.message).toContain('TU SESION EXPIRO O ES INVALIDA');
    expect(response.message).toContain('vuelve al chat');
  });
});
