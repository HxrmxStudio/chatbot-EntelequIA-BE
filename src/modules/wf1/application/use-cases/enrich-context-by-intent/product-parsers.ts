import { parseMoney } from '@/modules/wf1/domain/money';
import type { ProductSearchItem } from '@/modules/wf1/domain/products-context';

export function extractProductItems(payload: Record<string, unknown>): ProductSearchItem[] {
  const items = payload['items'];
  if (!Array.isArray(items)) {
    return [];
  }

  const parsed: ProductSearchItem[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      continue;
    }

    const record = raw as Record<string, unknown>;
    const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const stock = typeof record.stock === 'number' && Number.isFinite(record.stock) ? record.stock : 0;

    if (slug.length === 0 || title.length === 0) {
      continue;
    }

    const id = typeof record.id === 'string' || typeof record.id === 'number' ? record.id : slug;
    const price = parseMoney(record.price);
    const priceWithDiscount = parseMoney(record.priceWithDiscount);
    const categoryName = typeof record.categoryName === 'string' ? record.categoryName.trim() : undefined;
    const categorySlug = typeof record.categorySlug === 'string' ? record.categorySlug.trim() : undefined;

    parsed.push({
      id,
      slug,
      title,
      stock,
      ...(categoryName ? { categoryName } : {}),
      ...(categorySlug ? { categorySlug } : {}),
      ...(typeof record.url === 'string' ? { url: record.url } : {}),
      ...(typeof record.imageUrl === 'string' ? { imageUrl: record.imageUrl } : {}),
      ...(price ? { price } : {}),
      ...(priceWithDiscount ? { priceWithDiscount } : {}),
      ...(typeof record.discountPercent === 'number' ? { discountPercent: record.discountPercent } : {}),
    });
  }

  return parsed;
}
