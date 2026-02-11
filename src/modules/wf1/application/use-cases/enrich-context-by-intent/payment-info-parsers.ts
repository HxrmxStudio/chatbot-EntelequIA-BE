import { isRecord } from '@/common/utils/object.utils';

const PAYMENT_METHOD_LABEL_KEYS = ['name', 'label', 'title', 'payment_method', 'method'] as const;
const PROMOTION_LABEL_KEYS = ['name', 'label', 'title', 'description', 'text'] as const;

export function extractPaymentMethods(payload: Record<string, unknown>): string[] {
  return extractStringList(payload['payment_methods'], PAYMENT_METHOD_LABEL_KEYS);
}

export function extractPromotions(payload: Record<string, unknown>): string[] {
  return extractStringList(payload['promotions'], PROMOTION_LABEL_KEYS);
}

function extractStringList(
  value: unknown,
  objectLabelKeys: ReadonlyArray<string>,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeListEntry(entry, objectLabelKeys);
    if (!normalized) continue;
    unique.add(normalized);
  }

  return Array.from(unique);
}

function normalizeListEntry(
  value: unknown,
  objectLabelKeys: ReadonlyArray<string>,
): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of objectLabelKeys) {
    const candidate = value[key];
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}
