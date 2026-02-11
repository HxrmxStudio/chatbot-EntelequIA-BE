import { isRecord } from '@/common/utils/object.utils';
import { parseMoney } from '@/modules/wf1/domain/money';
import { ExternalServiceError } from '@/modules/wf1/domain/errors';
import type { OrderDetailItem, OrderLineItem, OrderSummaryItem } from '@/modules/wf1/domain/orders-context';

export function extractOrdersList(payload: Record<string, unknown>): OrderSummaryItem[] {
  const rawList = extractOrdersArray(payload);
  if (!rawList) {
    return [];
  }

  return rawList
    .map((rawOrder) => parseOrder(rawOrder))
    .filter((order): order is OrderSummaryItem => Boolean(order));
}

export function extractOrdersTotal(payload: Record<string, unknown>, fallbackLength: number): number {
  const pagination = payload.pagination;
  if (!isRecord(pagination)) {
    return fallbackLength;
  }

  const rawTotal = pagination.total;
  if (typeof rawTotal === 'number' && Number.isFinite(rawTotal)) {
    return rawTotal;
  }

  if (typeof rawTotal === 'string') {
    const parsed = Number(rawTotal);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallbackLength;
}

export function extractOrderDetail(payload: Record<string, unknown>): OrderDetailItem | null {
  const nestedOrder = payload.order;
  if (isRecord(nestedOrder)) {
    return parseOrder(nestedOrder);
  }

  return parseOrder(payload);
}

export function isUnauthenticatedOrdersPayload(payload: Record<string, unknown>): boolean {
  const candidates = [payload.message, payload.error];

  return candidates.some((candidate) => {
    if (typeof candidate !== 'string') {
      return false;
    }

    return /unauthenticated/.test(candidate.trim().toLowerCase());
  });
}

/**
 * Throws ExternalServiceError if payload indicates unauthenticated state.
 * Centralizes error handling for unauthenticated orders responses.
 */
export function throwIfUnauthenticatedOrdersPayload(payload: Record<string, unknown>): void {
  if (isUnauthenticatedOrdersPayload(payload)) {
    throw new ExternalServiceError('Entelequia unauthorized response', 401, 'http', payload);
  }
}

function parseOrder(raw: unknown): OrderSummaryItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = parseId(raw.id);
  if (id === undefined) {
    return null;
  }

  const state = readString(raw.state) ?? '';
  const createdAt = readString(raw.created_at);
  const total = parseMoney(raw.total);
  const shipMethod = readString(raw.shipMethod);
  const shipTrackingCode = readString(raw.shipTrackingCode);
  const orderItems = parseOrderItems(raw.orderItems);
  const payment = parsePayment(raw.payment);

  return {
    id,
    state,
    ...(createdAt ? { createdAt } : {}),
    ...(total ? { total } : {}),
    ...(shipMethod ? { shipMethod } : {}),
    ...(shipTrackingCode ? { shipTrackingCode } : {}),
    orderItems,
    ...(payment ? { payment } : {}),
  };
}

function extractOrdersArray(payload: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    return data;
  }

  return null;
}

function parseId(value: unknown): string | number | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function parseOrderItems(value: unknown): OrderLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: OrderLineItem[] = [];
  for (const rawItem of value) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const quantity = parseQuantity(rawItem.quantity);
    if (quantity === null) {
      continue;
    }

    const title = readString(rawItem.productTitle) ?? readString(rawItem.title);
    const unitPrice = parseMoney(rawItem.productPrice) ?? parseMoney(rawItem.price);
    const totalPrice = parseMoney(rawItem.totalPrice);

    parsed.push({
      quantity,
      ...(title ? { title } : {}),
      ...(unitPrice ? { unitPrice } : {}),
      ...(totalPrice ? { totalPrice } : {}),
    });
  }

  return parsed;
}

function parsePayment(value: unknown): { paymentMethod?: string; status?: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const paymentMethod = readString(value.payment_method) ?? readString(value.paymentMethod);
  const status = readString(value.status) ?? readString(value.payment_status);

  if (!paymentMethod && !status) {
    return null;
  }

  return {
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(status ? { status } : {}),
  };
}

function parseQuantity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
