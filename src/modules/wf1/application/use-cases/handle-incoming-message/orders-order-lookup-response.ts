import { formatMoney } from '@/modules/wf1/domain/money';
import type { Wf1Response } from '../../../domain/wf1-response';

interface OrderLookupResponseOrder {
  id: string | number;
  state: string;
  total?: { currency: string; amount: number };
  paymentMethod?: string;
  shipMethod?: string;
  trackingCode?: string;
}

const LOOKUP_INSTRUCTIONS = [
  'Para consultar tu pedido sin iniciar sesion, enviame todo en un solo mensaje:',
  '- Numero de pedido (order_id)',
  '- Al menos 2 datos entre: dni, nombre, apellido, telefono',
  '',
  'Ejemplo: pedido 12345, dni 12345678, nombre Juan, apellido Perez',
].join('\n');

export function buildOrderLookupMissingOrderIdResponse(): Wf1Response {
  return {
    ok: false,
    message: `${LOOKUP_INSTRUCTIONS}\n\nNo encontre el numero de pedido en tu mensaje.`,
  };
}

export function buildOrderLookupMissingIdentityFactorsResponse(input: {
  providedFactors: number;
}): Wf1Response {
  const missing = Math.max(0, 2 - input.providedFactors);

  return {
    ok: false,
    message: `${LOOKUP_INSTRUCTIONS}\n\nRecibi ${input.providedFactors} dato(s) de identidad. Necesito ${missing} dato(s) mas.`,
  };
}

export function buildOrderLookupInvalidPayloadResponse(): Wf1Response {
  return {
    ok: false,
    message: `${LOOKUP_INSTRUCTIONS}\n\nNo pude validar el formato enviado.`,
  };
}

export function buildOrderLookupVerificationFailedResponse(): Wf1Response {
  return {
    ok: false,
    message:
      'No pudimos validar los datos del pedido. Verifica el numero de pedido y tus datos, e intenta nuevamente.',
  };
}

export function buildOrderLookupUnauthorizedResponse(): Wf1Response {
  return {
    ok: false,
    message:
      'No pude validar la consulta en este momento. Intenta nuevamente en unos segundos.',
  };
}

export function buildOrderLookupThrottledResponse(): Wf1Response {
  return {
    ok: false,
    message:
      'Hay alta demanda para consultas de pedidos. Intenta nuevamente en unos segundos.',
  };
}

export function buildOrderLookupSuccessMessage(order: OrderLookupResponseOrder): string {
  const total = order.total ? formatMoney(order.total) : 'No disponible';
  const shipMethod = normalizeOptional(order.shipMethod, 'No disponible');
  const tracking = normalizeOptional(order.trackingCode, 'Pendiente');
  const paymentMethod = normalizeOptional(order.paymentMethod, 'No disponible');
  const state = normalizeOptional(order.state, 'Sin estado');

  return [
    `[PEDIDO #${String(order.id)}]`,
    '',
    `- Estado: ${state}`,
    `- Total: ${total}`,
    `- Envio: ${shipMethod}`,
    `- Tracking: ${tracking}`,
    `- Pago: ${paymentMethod}`,
  ].join('\n');
}

function normalizeOptional(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
