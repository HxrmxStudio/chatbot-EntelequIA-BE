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

  it('maps catalog failures to catalog unavailable message', () => {
    const response = mapContextOrBackendError(
      new ExternalServiceError('Catalog unavailable', 500, 'http', {}, {
        service: 'entelequia',
        endpointGroup: 'catalog',
        endpointPath: '/products-list',
      }),
    );

    expect(response).toEqual({
      ok: false,
      message:
        'Ahora mismo no puedo consultar el catalogo. Intenta nuevamente en unos minutos o si queres te muestro categorias disponibles.',
    });
  });

  it('maps non-catalog timeouts to generic backend message', () => {
    const response = mapContextOrBackendError(
      new ExternalServiceError('Orders timeout', 0, 'timeout', undefined, {
        service: 'entelequia',
        endpointGroup: 'orders',
        endpointPath: '/account/orders',
      }),
    );

    expect(response).toEqual({
      ok: false,
      message:
        'Tuvimos un inconveniente momentaneo. Si queres, te ayudo con otra consulta o lo intentamos de nuevo en un momento.',
    });
  });
});
