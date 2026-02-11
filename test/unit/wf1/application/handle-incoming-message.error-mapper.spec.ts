import { ExternalServiceError, MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
import { mapContextOrBackendError } from '@/modules/wf1/application/use-cases/handle-incoming-message/error-mapper';

describe('error-mapper', () => {
  it('maps missing auth to requiresAuth response', () => {
    const response = mapContextOrBackendError(new MissingAuthForOrdersError());

    expect(response.ok).toBe(false);
    expect('requiresAuth' in response && response.requiresAuth).toBe(true);
    expect(response.message).toContain('NECESITAS INICIAR SESION');
  });

  it('maps backend 401 to requiresAuth session-expired response', () => {
    const response = mapContextOrBackendError(
      new ExternalServiceError('Unauthorized', 401, 'http'),
    );

    expect(response.ok).toBe(false);
    expect('requiresAuth' in response && response.requiresAuth).toBe(true);
    expect(response.message).toContain('TU SESION EXPIRO O ES INVALIDA');
  });

  it('maps backend 403 to forbidden message', () => {
    const response = mapContextOrBackendError(
      new ExternalServiceError('Forbidden', 403, 'http'),
    );

    expect(response).toEqual({
      ok: false,
      message: 'No tenes permisos para acceder a esa informacion.',
    });
  });
});
