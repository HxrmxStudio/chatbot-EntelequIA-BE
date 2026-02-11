export type { ProductSearchItem, ProductsContextPayload } from './types';
export type { Money } from '../money';
export {
  WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS,
  WF1_PRODUCTS_CONTEXT_MAX_ITEMS,
  WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS,
} from './constants';
export { buildProductsSummary, buildProductAvailabilityHint } from './summary';
export type { ProductsAiContext } from './format';
export { buildProductsAiContext } from './format';
export { selectBestProductMatch } from './match';
export { resolveStockLabel } from './stock-visibility';
