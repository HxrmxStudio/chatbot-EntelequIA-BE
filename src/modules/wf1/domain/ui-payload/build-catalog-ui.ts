import type { ContextBlock } from '../context-block';
import { formatMoney } from '../money';
import { WF1_UI_CATALOG_MAX_CARDS, WF1_UI_LOW_STOCK_THRESHOLD } from './constants';
import type { UiAvailabilityLabel, UiPayloadV1, UiProductCard } from './types';

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
      cards: cards.slice(0, WF1_UI_CATALOG_MAX_CARDS),
    };
  }

  return undefined;
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
    ...(thumbnailUrl
      ? {
          thumbnailUrl,
          thumbnailAlt: `Imagen de ${title}`,
        }
      : {}),
    ...(badges.length > 0 ? { badges } : {}),
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

function resolveThumbnailUrl(record: Record<string, unknown>): string | undefined {
  const imageUrl = normalizeHttpsUrl(record.imageUrl);
  if (imageUrl) {
    return imageUrl;
  }

  return normalizeHttpsUrl(record.thumbnailUrl);
}

function resolveBadges(discountValue: unknown): string[] {
  const discount = toFiniteNumber(discountValue);
  if (discount === undefined || discount <= 0) {
    return [];
  }

  return [`-${discount}%`];
}

function formatMoneyRecord(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const amount = toFiniteNumber(value.amount);
  const currency = normalizeNonEmptyString(value.currency);
  if (amount === undefined || !currency) {
    return undefined;
  }

  return formatMoney({ amount, currency });
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

function normalizeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:') {
      return undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
