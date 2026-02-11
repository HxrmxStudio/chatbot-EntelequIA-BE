import { formatMoney } from '../money';
import {
  CANONICAL_ORDER_STATE_LABELS,
  DEFAULT_ORDER_DATE_FALLBACK,
  DEFAULT_ORDER_DETAIL_INSTRUCTIONS,
  DEFAULT_ORDER_ITEMS_FALLBACK,
  DEFAULT_ORDER_PAYMENT_METHOD_FALLBACK,
  DEFAULT_ORDER_PAYMENT_STATUS_FALLBACK,
  DEFAULT_ORDER_SHIP_METHOD_FALLBACK,
  DEFAULT_ORDER_TOTAL_FALLBACK,
  DEFAULT_ORDER_TRACKING_FALLBACK,
  DEFAULT_ORDERS_CONTEXT_HEADER,
  DEFAULT_ORDERS_EMPTY_MESSAGE,
  DEFAULT_ORDERS_LIST_INSTRUCTIONS,
  WF1_ORDERS_CONTEXT_AI_MAX_ITEMS,
} from './constants';
import type {
  CanonicalOrderState,
  OrderDetailAiContext,
  OrderDetailItem,
  OrdersAiContext,
  OrdersContextTemplates,
  OrderSummaryItem,
} from './types';

/**
 * Builds an AI-oriented context text for an orders list payload.
 */
export function buildOrdersListAiContext(input: {
  orders: OrderSummaryItem[];
  total?: number;
  templates?: Partial<OrdersContextTemplates>;
}): OrdersAiContext {
  const orders = Array.isArray(input.orders) ? input.orders : [];
  const ordersShownItems = orders.slice(0, WF1_ORDERS_CONTEXT_AI_MAX_ITEMS);
  const ordersShown = ordersShownItems.length;
  const totalOrders = typeof input.total === 'number' ? input.total : orders.length;

  const emptyMessage = input.templates?.emptyMessage ?? DEFAULT_ORDERS_EMPTY_MESSAGE;
  if (ordersShown === 0) {
    return {
      contextText: emptyMessage,
      ordersShown: 0,
      totalOrders,
    };
  }

  const header = input.templates?.header ?? DEFAULT_ORDERS_CONTEXT_HEADER;
  const instructions = input.templates?.listInstructions ?? DEFAULT_ORDERS_LIST_INSTRUCTIONS;
  const orderList = ordersShownItems.map((order, index) => formatOrderSummaryItem(order, index)).join('\n\n');

  const contextLines: string[] = [
    header,
    '',
    orderList,
    '',
    'Resumen:',
    `- Mostrando ${ordersShown} de ${totalOrders} pedidos`,
    '',
    instructions,
  ];

  return {
    contextText: contextLines.join('\n'),
    ordersShown,
    totalOrders,
  };
}

/**
 * Builds an AI-oriented context text for an order detail payload.
 */
export function buildOrderDetailAiContext(input: {
  order: OrderDetailItem | null;
  templates?: Partial<OrdersContextTemplates>;
}): OrderDetailAiContext {
  if (!input.order) {
    return {
      contextText: input.templates?.emptyMessage ?? DEFAULT_ORDERS_EMPTY_MESSAGE,
    };
  }

  const detailInstructions =
    input.templates?.detailInstructions ?? DEFAULT_ORDER_DETAIL_INSTRUCTIONS;
  const order = input.order;

  const contextLines: string[] = [
    `PEDIDO #${String(order.id)}`,
    '',
    `Estado: ${formatOrderState(order.state)}`,
    `Fecha: ${formatOrderDateEsAr(order.createdAt)}`,
    `Total: ${formatOrderTotal(order)}`,
    '',
    'Envio:',
    `- Metodo: ${formatShippingMethod(order.shipMethod)}`,
    `- Tracking: ${formatTracking(order.shipTrackingCode)}`,
    '',
    'Productos:',
    formatOrderItems(order),
    '',
    'Pago:',
    `- Metodo: ${formatPaymentMethod(order)}`,
    `- Estado: ${formatPaymentStatus(order)}`,
    '',
    detailInstructions,
  ];

  return {
    contextText: contextLines.join('\n'),
    orderId: order.id,
  };
}

export function normalizeOrderState(state: string): CanonicalOrderState {
  const normalized = state.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'unknown';
  }

  if (/pend|pending|espera|pago/.test(normalized)) {
    return 'pending';
  }

  if (/process|prepar|packing|armad/.test(normalized)) {
    return 'processing';
  }

  if (/ship|envi|transit|despach/.test(normalized)) {
    return 'shipped';
  }

  if (/deliver|entreg|complet|finaliz/.test(normalized)) {
    return 'delivered';
  }

  if (/cancel|rechaz|anulad/.test(normalized)) {
    return 'cancelled';
  }

  return 'unknown';
}

export function formatOrderDateEsAr(value?: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_ORDER_DATE_FALLBACK;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return DEFAULT_ORDER_DATE_FALLBACK;
  }

  return date.toLocaleDateString('es-AR');
}

export function formatTracking(value?: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_ORDER_TRACKING_FALLBACK;
  }

  return value.trim();
}

export function formatOrderItems(order: Pick<OrderSummaryItem, 'orderItems'>): string {
  if (!Array.isArray(order.orderItems) || order.orderItems.length === 0) {
    return `- ${DEFAULT_ORDER_ITEMS_FALLBACK}`;
  }

  return order.orderItems
    .map((item, index) => {
      const title =
        typeof item.title === 'string' && item.title.trim().length > 0
          ? item.title.trim()
          : `Item ${index + 1}`;
      const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      const price = item.unitPrice ? formatMoney(item.unitPrice) : DEFAULT_ORDER_TOTAL_FALLBACK;

      return `${index + 1}. ${title} - Cantidad: ${quantity} - Precio: ${price}`;
    })
    .join('\n');
}

export function formatPaymentMethod(order: Pick<OrderSummaryItem, 'payment'>): string {
  const paymentMethod = order.payment?.paymentMethod;
  if (typeof paymentMethod !== 'string' || paymentMethod.trim().length === 0) {
    return DEFAULT_ORDER_PAYMENT_METHOD_FALLBACK;
  }

  return paymentMethod.trim();
}

export function formatPaymentStatus(order: Pick<OrderSummaryItem, 'payment'>): string {
  const paymentStatus = order.payment?.status;
  if (typeof paymentStatus !== 'string' || paymentStatus.trim().length === 0) {
    return DEFAULT_ORDER_PAYMENT_STATUS_FALLBACK;
  }

  return paymentStatus.trim();
}

function formatOrderSummaryItem(order: OrderSummaryItem, index: number): string {
  return [
    `${index + 1}. Pedido #${String(order.id)}`,
    `- Estado: ${formatOrderState(order.state)}`,
    `- Fecha: ${formatOrderDateEsAr(order.createdAt)}`,
    `- Total: ${formatOrderTotal(order)}`,
    `- Tracking: ${formatTracking(order.shipTrackingCode)}`,
  ].join('\n');
}

function formatOrderState(rawState: string): string {
  const canonicalState = normalizeOrderState(rawState);
  return CANONICAL_ORDER_STATE_LABELS[canonicalState];
}

function formatOrderTotal(order: Pick<OrderSummaryItem, 'total'>): string {
  return order.total ? formatMoney(order.total) : DEFAULT_ORDER_TOTAL_FALLBACK;
}

function formatShippingMethod(shipMethod?: string): string {
  if (typeof shipMethod !== 'string' || shipMethod.trim().length === 0) {
    return DEFAULT_ORDER_SHIP_METHOD_FALLBACK;
  }

  return shipMethod.trim();
}
