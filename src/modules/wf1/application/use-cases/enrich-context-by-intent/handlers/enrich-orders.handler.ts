import type { ContextBlock } from '@/modules/wf1/domain/context-block';
import { MissingAuthForOrdersError } from '@/modules/wf1/domain/errors';
import {
  buildOrderDetailAiContext,
  buildOrdersListAiContext,
  type OrderSummaryItem,
} from '@/modules/wf1/domain/orders-context';
import { resolveOrderId } from '../query-resolvers';
import {
  extractOrderDetail,
  extractOrdersList,
  extractOrdersTotal,
  throwIfUnauthenticatedOrdersPayload,
} from '../order-parsers';
import type { EnrichInput, EnrichDeps } from '../types';

export async function enrichOrders(
  input: EnrichInput,
  deps: EnrichDeps,
): Promise<ContextBlock[]> {
  const { promptTemplates } = deps;

  if (!input.accessToken) {
    throw new MissingAuthForOrdersError();
  }

  const ordersTemplates = {
    header: promptTemplates.getOrdersListContextHeader(),
    listInstructions: promptTemplates.getOrdersListContextInstructions(),
    detailInstructions: promptTemplates.getOrderDetailContextInstructions(),
    emptyMessage: promptTemplates.getOrdersEmptyContextMessage(),
  };

  const orderId = resolvePreferredOrderId(
    input.orderIdOverride,
    input.intentResult.entities,
    input.text,
  );

  if (orderId) {
    const orderDetail = await deps.entelequiaContextPort.getOrderDetail({
      accessToken: input.accessToken,
      orderId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    });

    throwIfUnauthenticatedOrdersPayload(orderDetail.contextPayload);

    const ordersList = await deps.entelequiaContextPort.getOrders({
      accessToken: input.accessToken,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    });
    throwIfUnauthenticatedOrdersPayload(ordersList.contextPayload);

    const parsedOrder = extractOrderDetail(orderDetail.contextPayload);
    const parsedOrders = extractOrdersList(ordersList.contextPayload);
    const matchedListOrder = findOrderSummaryById(parsedOrders, orderId);
    const ordersStateConflict = Boolean(
      parsedOrder &&
        matchedListOrder &&
        parsedOrder.stateCanonical !== matchedListOrder.stateCanonical,
    );
    const aiContext = buildOrderDetailAiContext({
      order: parsedOrder,
      templates: ordersTemplates,
    });

    const detailWithAiContext: ContextBlock = {
      ...orderDetail,
      contextPayload: {
        ...orderDetail.contextPayload,
        ...(parsedOrder ? { orderId: parsedOrder.id } : { orderId }),
        ...(parsedOrder ? { parsedOrder } : {}),
        ...(matchedListOrder ? { matchedListOrder } : {}),
        orderStateRaw: parsedOrder?.stateRaw ?? null,
        orderStateCanonical: parsedOrder?.stateCanonical ?? null,
        orderListStateRaw: matchedListOrder?.stateRaw ?? null,
        orderListStateCanonical: matchedListOrder?.stateCanonical ?? null,
        ordersStateConflict,
        aiContext: aiContext.contextText,
      },
    };

    return [detailWithAiContext];
  }

  const orders = await deps.entelequiaContextPort.getOrders({
    accessToken: input.accessToken,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });

  throwIfUnauthenticatedOrdersPayload(orders.contextPayload);

  const parsedOrders = extractOrdersList(orders.contextPayload);
  const totalOrders = extractOrdersTotal(orders.contextPayload, parsedOrders.length);
  const aiContext = buildOrdersListAiContext({
    orders: parsedOrders,
    total: totalOrders,
    templates: ordersTemplates,
  });

  const ordersWithAiContext: ContextBlock = {
    ...orders,
    contextPayload: {
      ...orders.contextPayload,
      aiContext: aiContext.contextText,
      ordersShown: aiContext.ordersShown,
      totalOrders: aiContext.totalOrders,
      parsedOrders,
    },
  };

  return [ordersWithAiContext];
}

function findOrderSummaryById(
  orders: OrderSummaryItem[],
  orderId: string,
): OrderSummaryItem | null {
  const normalizedOrderId = normalizeOrderId(orderId);
  if (normalizedOrderId.length === 0) {
    return null;
  }

  for (const order of orders) {
    if (normalizeOrderId(order.id) === normalizedOrderId) {
      return order;
    }
  }

  return null;
}

function resolvePreferredOrderId(
  orderIdOverride: string | undefined,
  entities: string[],
  text: string,
): string | undefined {
  const normalizedOverride = typeof orderIdOverride === 'string' ? orderIdOverride.trim() : '';
  return normalizedOverride.length > 0 ? normalizedOverride : resolveOrderId(entities, text);
}

function normalizeOrderId(value: string | number): string {
  return String(value).trim().toLowerCase();
}
