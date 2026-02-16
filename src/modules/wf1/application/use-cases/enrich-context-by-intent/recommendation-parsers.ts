import { isRecord } from '@/common/utils/object.utils';
import { parseMoney } from '@/modules/wf1/domain/money';
import type { RecommendationItem } from '@/modules/wf1/domain/recommendations-context';
import { productWebUrl, pickImageUrl } from '@/common/utils/url-builder.utils';

export function extractRecommendedItems(
  payload: Record<string, unknown> | unknown[],
  webBaseUrl: string,
): RecommendationItem[] {
  const data = extractRecommendationsArray(payload);
  const items: RecommendationItem[] = [];

  for (const raw of data) {
    if (!isRecord(raw)) {
      continue;
    }

    const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (slug.length === 0 || title.length === 0) {
      continue;
    }

    const id =
      typeof raw.id === 'number' || typeof raw.id === 'string' ? raw.id : slug;
    const stock = coerceNumber(raw.stock, 0);
    const categories = extractCategories(raw.categories);
    const price = parseMoney(raw.price);
    const priceWithDiscount = parseMoney(raw.priceWithDiscount);
    const discountPercent = coerceNumber(raw.discount_percent, null);
    const imageUrl = pickImageUrl(raw.images, webBaseUrl);

    items.push({
      id,
      slug,
      title,
      stock,
      categoryName: categories.names[0],
      categorySlug: categories.slugs[0],
      categoryNames: categories.names,
      categorySlugs: categories.slugs,
      ...(price ? { price } : {}),
      ...(priceWithDiscount ? { priceWithDiscount } : {}),
      ...(typeof discountPercent === 'number'
        ? { discountPercent }
        : {}),
      url: productWebUrl(webBaseUrl, slug),
      ...(imageUrl ? { imageUrl } : {}),
    });
  }

  return items;
}

export function extractRecommendationsTotal(
  payload: Record<string, unknown> | unknown[],
  fallbackLength: number,
): number {
  if (Array.isArray(payload)) {
    return fallbackLength;
  }

  const pagination = isRecord(payload.pagination) ? payload.pagination : undefined;
  const total =
    (pagination ? coerceNumber(pagination.total, null) : null) ??
    coerceNumber(payload.total, null);
  return typeof total === 'number' ? total : fallbackLength;
}

function extractRecommendationsArray(
  payload: Record<string, unknown> | unknown[],
): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

function extractCategories(value: unknown): { names: string[]; slugs: string[] } {
  if (!Array.isArray(value)) {
    return { names: [], slugs: [] };
  }

  const names: string[] = [];
  const slugs: string[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    if (typeof entry.name === 'string' && entry.name.trim().length > 0) {
      names.push(entry.name.trim());
    }

    if (typeof entry.slug === 'string' && entry.slug.trim().length > 0) {
      slugs.push(entry.slug.trim());
    }
  }

  return { names, slugs };
}

function coerceNumber(value: unknown, fallback: number): number;
function coerceNumber(value: unknown, fallback: null): number | null;
function coerceNumber(value: unknown, fallback: number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}
