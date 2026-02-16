import { normalizeTextForSearch } from '@/common/utils/text-normalize.utils';
import { isRecord } from '@/common/utils/object.utils';
import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import type { CatalogSnapshotItem } from '@/modules/wf1/domain/ui-payload';

export type PriceComparisonRequestIntent = 'cheapest' | 'most_expensive' | 'none';

const CHEAPEST_PATTERNS: readonly RegExp[] = [
  /\b(mas|más)\s+(barat[oa]?|economico|econ[oó]mico)\b/i,
  /\b(cual|cu[aá]l)\s+sale\s+menos\b/i,
  /\bprecio\s+(mas|más)\s+bajo\b/i,
  /\b(cheapest|precio\s+minimo|precio\s+m[ií]nimo)\b/i,
];

const MOST_EXPENSIVE_PATTERNS: readonly RegExp[] = [
  /\b(mas|más)\s+car[oa]\b/i,
  /\b(cual|cu[aá]l)\s+sale\s+mas\b/i,
  /\bprecio\s+(mas|más)\s+alto\b/i,
];

export function resolvePriceComparisonRequestIntent(
  text: string,
): PriceComparisonRequestIntent {
  const normalized = normalizeTextForSearch(text);
  if (normalized.length === 0) {
    return 'none';
  }

  if (CHEAPEST_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'cheapest';
  }

  if (MOST_EXPENSIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'most_expensive';
  }

  return 'none';
}

export function resolveLatestCatalogSnapshotFromHistory(
  historyRows: ConversationHistoryRow[],
): CatalogSnapshotItem[] {
  for (const row of historyRows) {
    if (row.sender !== 'bot') {
      continue;
    }

    if (!isRecord(row.metadata)) {
      continue;
    }

    const parsed = parseCatalogSnapshot(row.metadata['catalogSnapshot']);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

export function resolvePriceComparisonItem(input: {
  intent: Exclude<PriceComparisonRequestIntent, 'none'>;
  items: CatalogSnapshotItem[];
}): CatalogSnapshotItem | null {
  if (input.items.length === 0) {
    return null;
  }

  let selected = input.items[0];

  for (const item of input.items.slice(1)) {
    const isBetter =
      input.intent === 'cheapest'
        ? item.amount < selected.amount
        : item.amount > selected.amount;
    if (isBetter) {
      selected = item;
    }
  }

  return selected;
}

function parseCatalogSnapshot(value: unknown): CatalogSnapshotItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: CatalogSnapshotItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = normalizeNonEmptyString(entry['id']);
    const title = normalizeNonEmptyString(entry['title']);
    const productUrl = normalizeHttpUrl(entry['productUrl']);
    const thumbnailUrl =
      normalizeHttpUrl(entry['thumbnailUrl']) ??
      'https://entelequia.com.ar/favicon.ico';
    const currency = normalizeNonEmptyString(entry['currency']);
    const amount = normalizeFiniteNumber(entry['amount']);

    if (!id || !title || !productUrl || !currency || amount === null) {
      continue;
    }

    parsed.push({
      id,
      title,
      productUrl,
      thumbnailUrl,
      currency,
      amount,
    });
  }

  return parsed;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function normalizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
    return normalized;
  } catch {
    return undefined;
  }
}

