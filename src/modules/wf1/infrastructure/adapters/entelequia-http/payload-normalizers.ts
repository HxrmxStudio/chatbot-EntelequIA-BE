import { isRecord } from '@/common/utils/object.utils';
import {
  buildProductsSummary,
  WF1_PRODUCTS_CONTEXT_MAX_ITEMS,
  type ProductSearchItem,
} from '@/modules/wf1/domain/products-context';
import { parseMoney } from '@/modules/wf1/domain/money';
import { productWebUrl } from './endpoints';
import {
  coerceNumber,
  extractCategoryInfo,
  extractTotal,
  pickImageUrl,
} from './product-helpers';

export function normalizeProductsListPayload(
  body: Record<string, unknown>,
  query: string | undefined,
  webBaseUrl: string,
): Record<string, unknown> {
  const productsContainer = isRecord(body.products) ? (body.products as Record<string, unknown>) : undefined;
  const dataArray = productsContainer && Array.isArray(productsContainer.data) ? productsContainer.data : [];

  const items: ProductSearchItem[] = [];
  for (const raw of dataArray.slice(0, WF1_PRODUCTS_CONTEXT_MAX_ITEMS)) {
    if (!isRecord(raw)) {
      continue;
    }

    const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';

    if (slug.length === 0 || title.length === 0) {
      continue;
    }

    const id = typeof raw.id === 'number' || typeof raw.id === 'string' ? raw.id : slug;
    const stock = coerceNumber(raw.stock, 0);
    const price = parseMoney(raw.price);
    const priceWithDiscount = parseMoney(raw.priceWithDiscount);
    const discountPercent = coerceNumber(raw.discount_percent, null);
    const imageUrl = pickImageUrl(raw.images, webBaseUrl);
    const categoryInfo = extractCategoryInfo(raw.categories);

    items.push({
      id,
      slug,
      title,
      stock,
      ...(categoryInfo.name ? { categoryName: categoryInfo.name } : {}),
      ...(categoryInfo.slug ? { categorySlug: categoryInfo.slug } : {}),
      ...(price ? { price } : {}),
      ...(priceWithDiscount ? { priceWithDiscount } : {}),
      ...(typeof discountPercent === 'number' ? { discountPercent } : {}),
      url: productWebUrl(webBaseUrl, slug),
      ...(imageUrl ? { imageUrl } : {}),
    });
  }

  const total = extractTotal(productsContainer);
  const trimmedQuery = typeof query === 'string' ? query.trim() : undefined;

  return {
    ...(trimmedQuery ? { query: trimmedQuery } : {}),
    ...(typeof total === 'number' ? { total } : {}),
    items,
    summary: buildProductsSummary(items),
  };
}

export function normalizeProductDetailPayload(
  body: Record<string, unknown>,
  webBaseUrl: string,
): Record<string, unknown> {
  const product = isRecord(body.product) ? (body.product as Record<string, unknown>) : undefined;
  if (!product) {
    return { product: {} };
  }

  const slug = typeof product.slug === 'string' ? product.slug.trim() : '';
  const title = typeof product.title === 'string' ? product.title.trim() : '';
  const id = typeof product.id === 'number' || typeof product.id === 'string' ? product.id : slug;
  const stock = coerceNumber(product.stock, 0);
  const price = parseMoney(product.price);
  const priceWithDiscount = parseMoney(product.priceWithDiscount);
  const discountPercent = coerceNumber(product.discount_percent, null);
  const imageUrl = pickImageUrl(product.images, webBaseUrl);

  const normalized: Record<string, unknown> = {
    id,
    slug,
    title,
    stock,
    url: slug.length > 0 ? productWebUrl(webBaseUrl, slug) : undefined,
    ...(price ? { price } : {}),
    ...(priceWithDiscount ? { priceWithDiscount } : {}),
    ...(typeof discountPercent === 'number' ? { discountPercent } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };

  if (isRecord(product.stocks)) {
    normalized.stocks = product.stocks;
  }

  return { product: normalized };
}
