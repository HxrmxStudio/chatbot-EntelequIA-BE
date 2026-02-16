import { isRecord } from '@/common/utils/object.utils';
import type { ContextBlock } from '../context-block';
import { formatMoney, parseMoney } from '../money';
import { WF1_UI_LOW_STOCK_THRESHOLD, WF1_UI_THUMBNAIL_FALLBACK_URL } from './constants';
import type {
  CatalogSnapshotItem,
  UiAvailabilityLabel,
  UiPayloadV1,
  UiProductCard,
} from './types';

type SupportedContextType = 'products' | 'recommendations';

export function buildCatalogUiPayload(
  contextBlocks: ContextBlock[],
): UiPayloadV1 | undefined {
  for (const contextType of ['products', 'recommendations'] as const) {
    const cards = extractCardsByContextType(contextBlocks, contextType);
    if (cards.length === 0) {
      continue;
    }

    return {
      version: '1',
      kind: 'catalog',
      layout: 'list',
      cards,
    };
  }

  return undefined;
}

export function buildCatalogSnapshot(
  contextBlocks: ContextBlock[],
): CatalogSnapshotItem[] {
  for (const contextType of ['products', 'recommendations'] as const) {
    const items = extractSnapshotByContextType(contextBlocks, contextType);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function extractCardsByContextType(
  contextBlocks: ContextBlock[],
  contextType: SupportedContextType,
): UiProductCard[] {
  const block = contextBlocks.find((entry) => entry.contextType === contextType);
  if (!block || !isRecord(block.contextPayload)) {
    return [];
  }

  if (contextType === 'products') {
    return extractCardsFromProductsPayload(block.contextPayload);
  }

  return extractCardsFromRecommendationsPayload(block.contextPayload);
}

function extractSnapshotByContextType(
  contextBlocks: ContextBlock[],
  contextType: SupportedContextType,
): CatalogSnapshotItem[] {
  const block = contextBlocks.find((entry) => entry.contextType === contextType);
  if (!block || !isRecord(block.contextPayload)) {
    return [];
  }

  const items =
    contextType === 'products'
      ? Array.isArray(block.contextPayload.items)
        ? block.contextPayload.items
        : []
      : Array.isArray(block.contextPayload.products)
        ? block.contextPayload.products
        : [];

  return extractSnapshotFromArray(items);
}

function extractCardsFromProductsPayload(
  payload: Record<string, unknown>,
): UiProductCard[] {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return extractCardsFromArray(items);
}

function extractCardsFromRecommendationsPayload(
  payload: Record<string, unknown>,
): UiProductCard[] {
  const products = Array.isArray(payload.products) ? payload.products : [];
  return extractCardsFromArray(products);
}

function extractCardsFromArray(items: unknown[]): UiProductCard[] {
  const cards: UiProductCard[] = [];

  for (const rawItem of items) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const card = mapRecordToCard(rawItem);
    if (!card) {
      continue;
    }

    cards.push(card);
  }

  return cards;
}

function extractSnapshotFromArray(items: unknown[]): CatalogSnapshotItem[] {
  const snapshot: CatalogSnapshotItem[] = [];

  for (const rawItem of items) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const item = mapRecordToSnapshotItem(rawItem);
    if (!item) {
      continue;
    }

    snapshot.push(item);
  }

  return snapshot;
}

function mapRecordToCard(record: Record<string, unknown>): UiProductCard | undefined {
  const title = normalizeNonEmptyString(record.title);
  const productUrl = normalizeHttpUrl(record.url);

  if (!title || !productUrl) {
    return undefined;
  }

  const id = normalizeIdentifier(record.id, record.slug);
  const subtitle = resolveSubtitle(record);
  const priceLabel = resolvePriceLabel(record);
  const availabilityLabel = resolveAvailabilityLabel(record.stock);
  const thumbnailUrl = resolveThumbnailUrl(record);
  const badges = resolveBadges(record.discountPercent ?? record.discount_percent);

  return {
    id,
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(priceLabel ? { priceLabel } : {}),
    ...(availabilityLabel ? { availabilityLabel } : {}),
    productUrl,
    thumbnailUrl,
    thumbnailAlt: `Imagen de ${title}`,
    ...(badges.length > 0 ? { badges } : {}),
  };
}

function mapRecordToSnapshotItem(
  record: Record<string, unknown>,
): CatalogSnapshotItem | undefined {
  const title = normalizeNonEmptyString(record.title);
  const productUrl = normalizeHttpUrl(record.url);
  if (!title || !productUrl) {
    return undefined;
  }

  const money = resolveSnapshotMoney(record);
  if (!money) {
    return undefined;
  }

  return {
    id: normalizeIdentifier(record.id, record.slug),
    title,
    productUrl,
    thumbnailUrl: resolveThumbnailUrl(record),
    currency: money.currency,
    amount: money.amount,
  };
}

function resolveSubtitle(record: Record<string, unknown>): string | undefined {
  const categoryName = normalizeNonEmptyString(record.categoryName);
  if (categoryName) {
    return categoryName;
  }

  if (Array.isArray(record.categoryNames)) {
    for (const candidate of record.categoryNames) {
      const normalized = normalizeNonEmptyString(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  if (Array.isArray(record.categories)) {
    for (const category of record.categories) {
      if (!isRecord(category)) {
        continue;
      }
      const name = normalizeNonEmptyString(category.name);
      if (name) {
        return name;
      }
    }
  }

  return undefined;
}

function resolvePriceLabel(record: Record<string, unknown>): string | undefined {
  const formattedWithDiscount = formatMoneyRecord(record.priceWithDiscount);
  if (formattedWithDiscount) {
    return formattedWithDiscount;
  }

  const formattedRegular = formatMoneyRecord(record.price);
  if (formattedRegular) {
    return formattedRegular;
  }

  const plain = normalizeNonEmptyString(record.priceLabel);
  return plain ?? undefined;
}

function resolveAvailabilityLabel(value: unknown): UiAvailabilityLabel | undefined {
  const stock = toFiniteNumber(value);
  if (stock === undefined) {
    return undefined;
  }

  if (stock <= 0) {
    return 'sin stock';
  }

  if (stock <= WF1_UI_LOW_STOCK_THRESHOLD) {
    return 'quedan pocas unidades';
  }

  return 'hay stock';
}

function resolveThumbnailUrl(record: Record<string, unknown>): string {
  const directCandidates = [
    record.imageUrl,
    record.image_url,
    record.thumbnailUrl,
    record.thumbnail_url,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeImageUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  if (isRecord(record.image)) {
    const normalized = normalizeImageUrl(record.image.url ?? record.image.src);
    if (normalized) {
      return normalized;
    }
  }

  if (isRecord(record.thumbnail)) {
    const normalized = normalizeImageUrl(record.thumbnail.url ?? record.thumbnail.src);
    if (normalized) {
      return normalized;
    }
  }

  if (Array.isArray(record.images)) {
    for (const rawImage of record.images) {
      if (typeof rawImage === 'string') {
        const normalized = normalizeImageUrl(rawImage);
        if (normalized) {
          return normalized;
        }
        continue;
      }

      if (!isRecord(rawImage)) {
        continue;
      }

      const normalized = normalizeImageUrl(rawImage.url ?? rawImage.src ?? rawImage.path);
      if (normalized) {
        return normalized;
      }
    }
  }

  return WF1_UI_THUMBNAIL_FALLBACK_URL;
}

function resolveBadges(discountValue: unknown): string[] {
  const discount = toFiniteNumber(discountValue);
  if (discount === undefined || discount <= 0) {
    return [];
  }

  return [`-${discount}%`];
}

function formatMoneyRecord(value: unknown): string | undefined {
  const money = parseMoney(value);
  if (!money) {
    return undefined;
  }

  return formatMoney(money);
}

function resolveSnapshotMoney(
  record: Record<string, unknown>,
): { amount: number; currency: string } | undefined {
  const discounted = parseMoney(record.priceWithDiscount);
  if (discounted) {
    return {
      amount: discounted.amount,
      currency: discounted.currency,
    };
  }

  const regular = parseMoney(record.price);
  if (regular) {
    return {
      amount: regular.amount,
      currency: regular.currency,
    };
  }

  return undefined;
}

function normalizeIdentifier(id: unknown, slug: unknown): string {
  const normalizedId = normalizeNonEmptyString(id);
  if (normalizedId) {
    return normalizedId;
  }

  const normalizedSlug = normalizeNonEmptyString(slug);
  if (normalizedSlug) {
    return normalizedSlug;
  }

  return 'unknown';
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
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

function normalizeImageUrl(value: unknown): string | undefined {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return url.toString();
    }

    return normalized;
  } catch {
    return undefined;
  }
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
