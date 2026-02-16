import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { getExternalServiceErrorInfo } from '../../support/error-mapper';

export function buildOrderErrorContextBlocks(input: {
  error: unknown;
  userText: string;
  isAuthenticated: boolean;
}): ContextBlock[] {
  const { statusCode, errorCode } = getExternalServiceErrorInfo(input.error);

  let errorDesc = 'El sistema no pudo consultar el pedido.';
  const hints: string[] = [];

  if (statusCode === 404) {
    errorDesc = 'El pedido no fue encontrado o los datos no coinciden.';
    hints.push('El pedido podría estar asociado a otra cuenta');
    hints.push(
      input.isAuthenticated
        ? 'Verifica que los datos sean correctos'
        : 'Si tenés cuenta, iniciá sesión para ver tus pedidos',
    );
  } else if (statusCode === 401) {
    errorDesc = 'Se requiere autenticación.';
    hints.push('Iniciá sesión en entelequia.com.ar');
  } else if (errorCode === 'timeout' || errorCode === 'network') {
    errorDesc = 'El servidor no respondió a tiempo.';
    hints.push('Intentá nuevamente en unos momentos');
    hints.push('Podés ver tus pedidos en https://entelequia.com.ar/mi-cuenta/pedidos');
  }

  hints.push('También podés contactar por WhatsApp: +54 9 11 6189-8533');

  const aiContext = [
    `Error al buscar pedido: ${errorDesc}`,
    `Usuario: ${input.isAuthenticated ? 'autenticado' : 'invitado'}`,
    `Texto: "${input.userText}"`,
    '',
    ...hints.map((h) => `- ${h}`),
  ].join('\n');

  return [
    {
      contextType: 'order_lookup_error',
      contextPayload: { aiContext },
    },
  ];
}
