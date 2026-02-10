import { isRecord } from '@/common/utils/object.utils';
import { storageImageUrl } from './endpoints';

export async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function coerceNumber(value: unknown, fallback: number): number;
export function coerceNumber(value: unknown, fallback: null): number | null;
export function coerceNumber(value: unknown, fallback: number | null): number | null {
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

export function extractTotal(productsContainer: Record<string, unknown> | undefined): number | undefined {
  if (!productsContainer) {
    return undefined;
  }

  const pagination = isRecord(productsContainer.pagination) ? (productsContainer.pagination as Record<string, unknown>) : undefined;
  const total =
    (pagination ? coerceNumber(pagination.total, null) : null) ?? coerceNumber(productsContainer.total, null);

  return typeof total === 'number' ? total : undefined;
}

export function extractCategoryInfo(
  categories: unknown,
): { name?: string; slug?: string } {
  if (!Array.isArray(categories) || categories.length === 0) {
    return {};
  }

  const first = categories[0];
  if (!isRecord(first)) {
    return {};
  }

  const name = typeof first.name === 'string' ? first.name.trim() : undefined;
  const slug = typeof first.slug === 'string' ? first.slug.trim() : undefined;

  return {
    ...(name && name.length > 0 ? { name } : {}),
    ...(slug && slug.length > 0 ? { slug } : {}),
  };
}

export function pickImageUrl(images: unknown, webBaseUrl: string): string | undefined {
  if (!Array.isArray(images) || images.length === 0) {
    return undefined;
  }

  const first = images[0];
  if (!isRecord(first)) {
    return undefined;
  }

  if (typeof first.url === 'string' && first.url.trim().length > 0) {
    return first.url.trim();
  }

  if (typeof first.path === 'string' && first.path.trim().length > 0) {
    return storageImageUrl(webBaseUrl, first.path);
  }

  return undefined;
}
