import {
  type CanonicalOrderState,
  type OrderSummaryItem,
} from '@/modules/wf1/domain/orders-context';
import { CANONICAL_ORDER_STATE_LABELS } from '@/modules/wf1/domain/orders-context/constants';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import {
  extractOrderDetail,
  extractOrdersList,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/order-parsers';
import { reconcileOrdersState } from './reconcile-orders-state';

export type OrdersDataSource = 'list' | 'detail' | 'conflict';

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
}): OrdersDeterministicResolution {
  const detailBlock = input.contextBlocks.find((block) => block.contextType === 'order_detail');
  if (detailBlock) {
    return formatDetailResponse({
      conversationId: input.conversationId,
      block: detailBlock,
      requestedOrderId: input.requestedOrderId ?? null,
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
      })
    : buildDetailMessage({
        order: detailOrder,
        fallbackOrderId: detailOrderId,
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

  lines.push('Si queres, reviso otro pedido de tu cuenta.');
  return lines.join('\n');
}

function buildConflictMessage(input: {
  orderId: string | null;
  detailStateRaw: string | null;
  listStateRaw: string | null;
}): string {
  const orderLabel = input.orderId ? `#${input.orderId}` : 'solicitado';
  const detailState = input.detailStateRaw ?? 'sin dato';
  const listState = input.listStateRaw ?? 'sin dato';

  return [
    `Detecte una inconsistencia temporal en el estado del pedido ${orderLabel}.`,
    `Detalle de pedido: ${detailState}.`,
    `Listado de pedidos: ${listState}.`,
    'Para evitar informarte un estado incorrecto, te sugiero revalidarlo en unos minutos o pedir soporte humano.',
  ].join('\n');
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
