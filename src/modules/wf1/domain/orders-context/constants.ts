import type { CanonicalOrderState } from './types';

export const WF1_ORDERS_CONTEXT_AI_MAX_ITEMS = 3;

export const DEFAULT_ORDERS_CONTEXT_HEADER = 'TUS ULTIMOS PEDIDOS';
export const DEFAULT_ORDERS_LIST_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Mostrar los pedidos de forma clara y ordenada.',
  '- Si preguntan por uno especifico, enfocarte en ese pedido.',
  '- Si hay tracking, mencionarlo.',
  '- Si no hay tracking, aclarar que se informa por email cuando este disponible.',
].join('\n');
export const DEFAULT_ORDER_DETAIL_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Explicar el estado del pedido de manera clara.',
  '- Si hay tracking, compartirlo.',
  '- Si no hay tracking, explicar que se notificara por email.',
  '- Ofrecer ayuda adicional si necesita soporte.',
].join('\n');
export const DEFAULT_ORDERS_EMPTY_MESSAGE =
  'No encontramos pedidos en tu cuenta. Si hiciste una compra recientemente, puede tardar unos minutos en aparecer.';
export const DEFAULT_ORDER_DATE_FALLBACK = 'No disponible';
export const DEFAULT_ORDER_TOTAL_FALLBACK = 'No disponible';
export const DEFAULT_ORDER_SHIP_METHOD_FALLBACK = 'A coordinar';
export const DEFAULT_ORDER_TRACKING_FALLBACK = 'Pendiente';
export const DEFAULT_ORDER_PAYMENT_METHOD_FALLBACK = 'No especificado';
export const DEFAULT_ORDER_PAYMENT_STATUS_FALLBACK = 'Pendiente';
export const DEFAULT_ORDER_ITEMS_FALLBACK = 'Sin detalle de productos';

export const CANONICAL_ORDER_STATE_LABELS: Record<CanonicalOrderState, string> = {
  pending: 'Pendiente',
  processing: 'En preparacion',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  unknown: 'Sin estado',
};
