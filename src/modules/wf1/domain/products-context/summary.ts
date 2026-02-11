import { formatMoney } from '../money';
import type { ProductSearchItem } from './types';
import { WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS } from './constants';
import { resolveStockLabel } from './stock-visibility';

export function buildProductsSummary(
  items: ProductSearchItem[],
  policy?: { discloseExactStock?: boolean; lowStockThreshold?: number },
): string {
  const discloseExactStock = policy?.discloseExactStock ?? false;
  const lowStockThreshold = policy?.lowStockThreshold ?? 3;

  if (items.length === 0) {
    return 'No encontre productos para esa busqueda.';
  }

  const lines = items
    .slice(0, WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS)
    .map((item) => {
      const priceMoney = item.priceWithDiscount ?? item.price;
      const price = priceMoney ? formatMoney(priceMoney) : 'precio no disponible';
      const stock = resolveStockLabel({
        stock: item.stock,
        discloseExact: discloseExactStock,
        lowStockThreshold,
      });
      return `- ${item.title}: ${price} (Stock: ${stock})`;
    });

  return ['Productos disponibles:', ...lines].join('\n');
}

export function buildProductAvailabilityHint(
  item: ProductSearchItem,
  policy?: { discloseExactStock?: boolean; lowStockThreshold?: number },
): string {
  const discloseExactStock = policy?.discloseExactStock ?? false;
  const lowStockThreshold = policy?.lowStockThreshold ?? 3;
  const priceMoney = item.priceWithDiscount ?? item.price;
  const price = priceMoney ? formatMoney(priceMoney) : undefined;
  const url = item.url ? `Link: ${item.url}` : undefined;
  const stockLabel = resolveStockLabel({
    stock: item.stock,
    discloseExact: discloseExactStock,
    lowStockThreshold,
  });

  if (item.stock > 0) {
    return [
      `Si, tenemos stock de "${item.title}".`,
      price ? `Precio: ${price}.` : undefined,
      `Stock: ${stockLabel}.`,
      url,
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ');
  }

  return [
    `Por el momento no hay stock de "${item.title}".`,
    price ? `Precio: ${price}.` : undefined,
    url,
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}
