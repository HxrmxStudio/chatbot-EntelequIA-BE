import { buildOrderErrorContextBlocks } from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/orders/build-order-error-context-blocks';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';

describe('buildOrderErrorContextBlocks', () => {
  it('builds context for 404 error (not found or mismatch)', () => {
    const error = new ExternalServiceError(
      'Order data could not be validated',
      404,
      'http',
    );
    const blocks = buildOrderErrorContextBlocks({
      error,
      userText: 'pedido 78399, dni 38321532, emiliano rozas',
      isAuthenticated: false,
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].contextType).toBe('order_lookup_error');
    expect(blocks[0].contextPayload.aiContext).toContain(
      'El pedido no fue encontrado o los datos no coinciden',
    );
    expect(blocks[0].contextPayload.aiContext).toContain('invitado');
    expect(blocks[0].contextPayload.aiContext).toContain(
      'Si tenés cuenta, iniciá sesión para ver tus pedidos',
    );
    expect(blocks[0].contextPayload.aiContext).toContain('WhatsApp');
  });

  it('builds context for 401 error (unauthorized)', () => {
    const error = new ExternalServiceError('Unauthorized', 401, 'http');
    const blocks = buildOrderErrorContextBlocks({
      error,
      userText: 'mis pedidos',
      isAuthenticated: true,
    });

    expect(blocks[0].contextPayload.aiContext).toContain(
      'Se requiere autenticación',
    );
    expect(blocks[0].contextPayload.aiContext).toContain('autenticado');
    expect(blocks[0].contextPayload.aiContext).toContain(
      'Iniciá sesión en entelequia.com.ar',
    );
  });

  it('builds context for timeout error', () => {
    const error = new ExternalServiceError(
      'Entelequia request timeout',
      0,
      'timeout',
    );
    const blocks = buildOrderErrorContextBlocks({
      error,
      userText: 'estado de mis pedidos',
      isAuthenticated: true,
    });

    expect(blocks[0].contextPayload.aiContext).toContain(
      'El servidor no respondió a tiempo',
    );
    expect(blocks[0].contextPayload.aiContext).toContain(
      'Intentá nuevamente en unos momentos',
    );
    expect(blocks[0].contextPayload.aiContext).toContain(
      'entelequia.com.ar/mi-cuenta/pedidos',
    );
  });

  it('builds generic context for unknown errors', () => {
    const error = new Error('Unknown error');
    const blocks = buildOrderErrorContextBlocks({
      error,
      userText: 'pedido 123',
      isAuthenticated: false,
    });

    expect(blocks[0].contextPayload.aiContext).toContain(
      'El sistema no pudo consultar el pedido',
    );
    expect(blocks[0].contextPayload.aiContext).toContain('WhatsApp');
  });
});
