import { formatMoney } from '../money';
import type { ProductSearchItem } from './types';
import { WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS } from './constants';

export function buildProductsSummary(items: ProductSearchItem[]): string {
  if (items.length === 0) {
    return 'No encontre productos para esa busqueda.';
  }

  const lines = items
    .slice(0, WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS)
    .map((item) => {
      const priceMoney = item.priceWithDiscount ?? item.price;
      const price = priceMoney ? formatMoney(priceMoney) : 'precio no disponible';
      return `- ${item.title}: ${price} (Stock: ${item.stock})`;
    });

  return ['Productos disponibles:', ...lines].join('\n');
}

export function buildProductAvailabilityHint(item: ProductSearchItem): string {
  const priceMoney = item.priceWithDiscount ?? item.price;
  const price = priceMoney ? formatMoney(priceMoney) : undefined;
  const url = item.url ? `Link: ${item.url}` : undefined;

  if (item.stock > 0) {
    return [
      `Si, tenemos stock de "${item.title}".`,
      price ? `Precio: ${price}.` : undefined,
      `Stock: ${item.stock}.`,
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
