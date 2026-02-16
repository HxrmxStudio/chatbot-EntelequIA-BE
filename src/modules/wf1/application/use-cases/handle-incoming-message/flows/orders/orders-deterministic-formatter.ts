import {
  type CanonicalOrderState,
  type OrderLineItem,
  type OrderSummaryItem,
} from '@/modules/wf1/domain/orders-context';
import { CANONICAL_ORDER_STATE_LABELS } from '@/modules/wf1/domain/orders-context/constants';
import { formatMoney } from '@/modules/wf1/domain/money';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import {
  extractOrderDetail,
  extractOrdersList,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/order-parsers';
import { reconcileOrdersState } from './reconcile-orders-state';

export type OrdersDataSource = 'list' | 'detail' | 'conflict';
const DEFAULT_ORDER_ITEMS_MAX = 5;

export interface OrdersDeterministicResolution {
  response: Wf1Response;
  ordersDataSource: OrdersDataSource;
  orderIdResolved: string | null;
  orderStateRaw: string | null;
  orderStateCanonical: CanonicalOrderState | null;
  ordersStateConflict: boolean;
  ordersDeterministicReply: true;
}

export function formatDeterministicOrdersResponse(input: {
  conversationId: string;
  contextBlocks: ContextBlock[];
  requestedOrderId?: string | null;
  includeOrderItems?: boolean;
  orderItemsMax?: number;
}): OrdersDeterministicResolution {
  const orderItemsMax = resolveOrderItemsMax(input.orderItemsMax);
  const detailBlock = input.contextBlocks.find((block) => block.contextType === 'order_detail');
  if (detailBlock) {
    return formatDetailResponse({
      conversationId: input.conversationId,
      block: detailBlock,
      requestedOrderId: input.requestedOrderId ?? null,
      includeOrderItems: input.includeOrderItems === true,
      orderItemsMax,
    });
  }

  const ordersBlock = input.contextBlocks.find((block) => block.contextType === 'orders');
  return formatListResponse({
    conversationId: input.conversationId,
    block: ordersBlock,
    requestedOrderId: input.requestedOrderId ?? null,
  });
}

function formatDetailResponse(input: {
  conversationId: string;
  block: ContextBlock;
  requestedOrderId: string | null;
  includeOrderItems: boolean;
  orderItemsMax: number;
}): OrdersDeterministicResolution {
  const detailOrder = extractOrderDetail(input.block.contextPayload);
  const detailOrderId =
    normalizeOrderId(readString(input.block.contextPayload.orderId)) ??
    normalizeOrderId(detailOrder?.id) ??
    input.requestedOrderId;

  const detailStateRaw =
    readString(input.block.contextPayload.orderStateRaw) ??
    readString(detailOrder?.stateRaw) ??
    readString(detailOrder?.state) ??
    null;
  const detailStateCanonical =
    readCanonical(input.block.contextPayload.orderStateCanonical) ??
    readCanonical(detailOrder?.stateCanonical) ??
    null;

  const listStateRaw = readString(input.block.contextPayload.orderListStateRaw);
  const listStateCanonical = readCanonical(input.block.contextPayload.orderListStateCanonical);
  const reconciliation = reconcileOrdersState({
    detailStateRaw,
    detailStateCanonical,
    listStateRaw,
    listStateCanonical,
  });

  const explicitConflict = input.block.contextPayload.ordersStateConflict === true;
  const ordersStateConflict = explicitConflict || reconciliation.conflict;

  const message = ordersStateConflict
    ? buildConflictMessage({
        orderId: detailOrderId,
        detailStateRaw: reconciliation.detailStateRaw,
        listStateRaw: reconciliation.listStateRaw,
        order: detailOrder,
        includeOrderItems: input.includeOrderItems,
        orderItemsMax: input.orderItemsMax,
      })
    : buildDetailMessage({
        order: detailOrder,
        fallbackOrderId: detailOrderId,
        includeOrderItems: input.includeOrderItems,
        orderItemsMax: input.orderItemsMax,
      });

  return {
    response: {
      ok: true,
      conversationId: input.conversationId,
      intent: 'orders',
      message,
    },
    ordersDataSource: ordersStateConflict ? 'conflict' : 'detail',
    orderIdResolved: detailOrderId,
    orderStateRaw: reconciliation.detailStateRaw,
    orderStateCanonical: reconciliation.detailStateCanonical,
    ordersStateConflict,
    ordersDeterministicReply: true,
  };
}

function formatListResponse(input: {
  conversationId: string;
  block?: ContextBlock;
  requestedOrderId: string | null;
}): OrdersDeterministicResolution {
  const parsedOrders = input.block
    ? extractOrdersList(input.block.contextPayload)
    : [];

  const matchedOrder = input.requestedOrderId
    ? findOrderById(parsedOrders, input.requestedOrderId)
    : null;

  return {
    response: {
      ok: true,
      conversationId: input.conversationId,
      intent: 'orders',
      message: buildOrdersListMessage(parsedOrders),
    },
    ordersDataSource: 'list',
    orderIdResolved: matchedOrder ? normalizeOrderId(matchedOrder.id) : input.requestedOrderId,
    orderStateRaw: matchedOrder?.stateRaw ?? matchedOrder?.state ?? null,
    orderStateCanonical: matchedOrder?.stateCanonical ?? null,
    ordersStateConflict: false,
    ordersDeterministicReply: true,
  };
}

function buildDetailMessage(input: {
  order: OrderSummaryItem | null;
  fallbackOrderId: string | null;
  includeOrderItems: boolean;
  orderItemsMax: number;
}): string {
  if (!input.order && !input.fallbackOrderId) {
    return 'No pude obtener el detalle de ese pedido en este momento. Intenta nuevamente en unos minutos.';
  }

  const orderId = normalizeOrderId(input.order?.id) ?? input.fallbackOrderId;
  const stateText = resolveStateText(input.order);
  const lines = [
    `Pedido #${orderId ?? 'sin id'}: estado actual ${stateText}.`,
  ];

  const tracking = readString(input.order?.shipTrackingCode);
  if (tracking) {
    lines.push(`Tracking informado: ${tracking}.`);
  }

  const shipMethod = readString(input.order?.shipMethod);
  if (shipMethod) {
    lines.push(`Metodo de envio: ${shipMethod}.`);
  }

  if (input.includeOrderItems) {
    lines.push('Productos del pedido:');
    lines.push(...formatOrderItemsLines(input.order?.orderItems ?? [], input.orderItemsMax));
  }

  lines.push('Si queres, reviso otro pedido de tu cuenta.');
  return lines.join('\n');
}

function buildConflictMessage(input: {
  orderId: string | null;
  detailStateRaw: string | null;
  listStateRaw: string | null;
  order: OrderSummaryItem | null;
  includeOrderItems: boolean;
  orderItemsMax: number;
}): string {
  const orderLabel = input.orderId ? `#${input.orderId}` : 'solicitado';
  const detailState = input.detailStateRaw ?? 'sin dato';
  const listState = input.listStateRaw ?? 'sin dato';
  const lines = [
    `Detecte una inconsistencia temporal en el estado del pedido ${orderLabel}.`,
    `Detalle de pedido: ${detailState}.`,
    `Listado de pedidos: ${listState}.`,
    'Para evitar informarte un estado incorrecto, te sugiero revalidarlo en unos minutos o pedir soporte humano.',
  ];

  if (input.includeOrderItems) {
    lines.push('Segun el detalle actual del pedido, los productos son:');
    lines.push(...formatOrderItemsLines(input.order?.orderItems ?? [], input.orderItemsMax));
  }

  return lines.join('\n');
}

function buildOrdersListMessage(orders: OrderSummaryItem[]): string {
  if (!Array.isArray(orders) || orders.length === 0) {
    return 'No encontramos pedidos en tu cuenta en este momento.';
  }

  const lines = ['Estos son tus pedidos mas recientes:'];
  for (const order of orders.slice(0, 3)) {
    const stateText = resolveStateText(order);
    lines.push(`- Pedido #${normalizeOrderId(order.id) ?? 'sin id'}: ${stateText}`);
  }
  lines.push('Si queres el detalle de uno, decime el numero de pedido.');

  return lines.join('\n');
}

function resolveStateText(order: OrderSummaryItem | null): string {
  if (!order) {
    return 'sin estado reportado';
  }

  const rawState = readString(order.stateRaw) ?? readString(order.state);
  if (rawState) {
    return rawState;
  }

  const canonical = order.stateCanonical;
  if (canonical) {
    return CANONICAL_ORDER_STATE_LABELS[canonical];
  }

  return 'sin estado reportado';
}

function findOrderById(orders: OrderSummaryItem[], orderId: string): OrderSummaryItem | null {
  const normalized = normalizeOrderId(orderId);
  if (!normalized) {
    return null;
  }

  for (const order of orders) {
    if (normalizeOrderId(order.id) === normalized) {
      return order;
    }
  }

  return null;
}

function formatOrderItemsLines(orderItems: OrderLineItem[], orderItemsMax: number): string[] {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return ['- Sin detalle de productos para este pedido.'];
  }

  const visibleItems = orderItems.slice(0, orderItemsMax);
  const lines = visibleItems.map((item, index) => buildOrderItemLine(item, index));
  const hiddenCount = orderItems.length - visibleItems.length;
  if (hiddenCount > 0) {
    lines.push(`... y ${hiddenCount} mas.`);
  }

  return lines;
}

function buildOrderItemLine(item: OrderLineItem, index: number): string {
  const title = readString(item.title) ?? `Item ${index + 1}`;
  const quantity =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
      ? Math.floor(item.quantity)
      : 1;
  const price = item.unitPrice ? formatMoney(item.unitPrice) : 'Precio no disponible';

  return `- ${title} x${quantity} - ${price}`;
}

function resolveOrderItemsMax(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ORDER_ITEMS_MAX;
  }

  return Math.max(1, Math.floor(value));
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readCanonical(value: unknown): CanonicalOrderState | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'pending':
    case 'processing':
    case 'shipped':
    case 'delivered':
    case 'cancelled':
    case 'unknown':
      return normalized;
    default:
      return null;
  }
}

function normalizeOrderId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
