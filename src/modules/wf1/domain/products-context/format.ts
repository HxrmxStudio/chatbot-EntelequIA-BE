import { loadPromptFile } from '@/modules/wf1/infrastructure/adapters/shared';
import { formatMoney } from '../money';
import {
  DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
  DEFAULT_PRODUCTS_CONTEXT_HEADER,
  DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
  PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
  PRODUCTS_CONTEXT_HEADER_PATH,
  PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
  WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS,
} from './constants';
import type { ProductSearchItem } from './types';

export interface ProductsAiContext {
  contextText: string;
  productCount: number;
  totalCount: number;
  inStockCount: number;
}

/**
 * Builds the AI context text for products.
 * Loads prompts from filesystem and constructs the context with dynamic product data.
 *
 * @param input - Products data and query
 * @returns ProductsAiContext with formatted context text and metadata
 */
export function buildProductsAiContext(input: {
  items: ProductSearchItem[];
  total?: number;
  query?: string;
}): ProductsAiContext {
  const productCount = input.items.length;
  const totalCount = typeof input.total === 'number' ? input.total : productCount;
  const inStockCount = input.items.filter((item) => item.stock > 0).length;

  const formattedList = input.items
    .slice(0, WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS)
    .map((item, index) => formatProductItem(item, index))
    .join('\n\n');

  const queryLine =
    typeof input.query === 'string' && input.query.trim().length > 0
      ? `- Query: ${input.query.trim()}`
      : undefined;

  const header = loadPromptFile(PRODUCTS_CONTEXT_HEADER_PATH, DEFAULT_PRODUCTS_CONTEXT_HEADER);
  const additionalInfo = loadPromptFile(
    PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH,
    DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO,
  );
  const instructions = loadPromptFile(
    PRODUCTS_CONTEXT_INSTRUCTIONS_PATH,
    DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS,
  );

  const contextLines: string[] = [
    header,
    '',
    formattedList.length > 0 ? formattedList : '(Sin resultados)',
    '',
    'Resumen:',
    `- Mostrando ${productCount} de ${totalCount} productos encontrados`,
    `- ${inStockCount} producto(s) con stock disponible`,
    ...(queryLine ? [queryLine] : []),
    '',
    additionalInfo,
    '',
    instructions,
  ];

  return {
    contextText: contextLines.join('\n'),
    productCount,
    totalCount,
    inStockCount,
  };
}

/**
 * Formats a single product item for the AI context.
 *
 * @param item - Product to format
 * @param index - Zero-based index for numbering
 * @returns Formatted product string
 */
function formatProductItem(item: ProductSearchItem, index: number): string {
  const category = item.categoryName ?? 'Producto';
  const priceMoney = item.priceWithDiscount ?? item.price;
  const priceText = priceMoney ? formatMoney(priceMoney) : 'Consultar';
  const discount =
    typeof item.discountPercent === 'number' ? ` (-${item.discountPercent}%)` : '';
  const stockText = item.stock > 0 ? `En stock (${item.stock})` : 'Sin stock';
  const url = item.url ?? '';

  return [
    `${index + 1}. **${item.title}**`,
    '',
    `- Categoria: ${category}`,
    `- Precio: ${priceText}${discount}`,
    `- Stock: ${stockText}`,
    url.length > 0 ? `- Ver: ${url}` : undefined,
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n');
}

