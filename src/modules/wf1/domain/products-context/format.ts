import { formatMoney } from '../money';
import { WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS } from './constants';
import type { ProductSearchItem } from './types';

export interface ProductsAiContext {
  contextText: string;
  productCount: number;
  totalCount: number;
  inStockCount: number;
}

export interface ProductsContextTemplates {
  header: string;
  additionalInfo: string;
  instructions: string;
}

/**
 * Builds the AI context text for products.
 * Constructs the context with dynamic product data.
 *
 * @param input - Products data and query
 * @returns ProductsAiContext with formatted context text and metadata
 */
export function buildProductsAiContext(input: {
  items: ProductSearchItem[];
  total?: number;
  query?: string;
  templates?: Partial<ProductsContextTemplates>;
}): ProductsAiContext {
  const displayedItems = input.items.slice(0, WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS);
  const productCount = displayedItems.length;
  const totalCount = typeof input.total === 'number' ? input.total : input.items.length;
  const inStockCount = displayedItems.filter((item) => item.stock > 0).length;

  const formattedList = displayedItems.map((item, index) => formatProductItem(item, index)).join('\n\n');

  const queryLine =
    typeof input.query === 'string' && input.query.trim().length > 0
      ? `- Query: ${input.query.trim()}`
      : undefined;

  // Use provided templates or empty strings (caller should always provide templates via PromptTemplatesPort)
  const header = input.templates?.header ?? 'PRODUCTOS ENTELEQUIA';
  const additionalInfo =
    input.templates?.additionalInfo ??
    'Informacion adicional:\n- Locales: Uruguay 341 (Centro) y Juramento 2584 (Belgrano)\n- Retiro sin cargo en tienda\n- Envios a todo el pais';
  const instructions =
    input.templates?.instructions ??
    'Instrucciones para tu respuesta:\n- Responder breve y claro, en espanol rioplatense.\n- Mencionar stock, precio y link cuando esten disponibles.\n- Si el usuario pide un tomo/numero que no aparece exacto, sugerir la edicion deluxe si existe.\n- Si falta informacion, pedir una sola aclaracion corta.';

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
