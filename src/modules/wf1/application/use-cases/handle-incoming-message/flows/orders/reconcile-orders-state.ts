import type { CanonicalOrderState } from '@/modules/wf1/domain/orders-context';

const CANONICAL_STATES = new Set<CanonicalOrderState>([
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'unknown',
]);

export interface OrdersStateReconciliationInput {
  detailStateRaw?: string | null;
  detailStateCanonical?: string | null;
  listStateRaw?: string | null;
  listStateCanonical?: string | null;
}

export interface OrdersStateReconciliationResult {
  detailStateRaw: string | null;
  detailStateCanonical: CanonicalOrderState | null;
  listStateRaw: string | null;
  listStateCanonical: CanonicalOrderState | null;
  conflict: boolean;
}

export function reconcileOrdersState(
  input: OrdersStateReconciliationInput,
): OrdersStateReconciliationResult {
  const detailStateCanonical = toCanonical(input.detailStateCanonical);
  const listStateCanonical = toCanonical(input.listStateCanonical);
  const conflict =
    detailStateCanonical !== null &&
    listStateCanonical !== null &&
    detailStateCanonical !== listStateCanonical;

  return {
    detailStateRaw: trimOrNull(input.detailStateRaw),
    detailStateCanonical,
    listStateRaw: trimOrNull(input.listStateRaw),
    listStateCanonical,
    conflict,
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toCanonical(value: string | null | undefined): CanonicalOrderState | null {
  const normalized = trimOrNull(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (CANONICAL_STATES.has(normalized as CanonicalOrderState)) {
    return normalized as CanonicalOrderState;
  }

  return null;
}
