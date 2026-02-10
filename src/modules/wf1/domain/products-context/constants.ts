// We keep enough items to allow best-match selection (e.g. volume requests) even when the API is sorted by recency.
export const WF1_PRODUCTS_CONTEXT_MAX_ITEMS = 20;

// Summaries should stay short even if we keep a larger items list for matching.
export const WF1_PRODUCTS_CONTEXT_SUMMARY_MAX_ITEMS = 8;

// AI context can include a few more items than the summary, but should remain reasonably small.
export const WF1_PRODUCTS_CONTEXT_AI_MAX_ITEMS = 12;

export const PRODUCTS_CONTEXT_HEADER_PATH = 'prompts/entelequia_products_context_header_v1.txt';
export const PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH = 'prompts/entelequia_products_context_additional_info_v1.txt';
export const PRODUCTS_CONTEXT_INSTRUCTIONS_PATH = 'prompts/entelequia_products_context_instructions_v1.txt';

export const DEFAULT_PRODUCTS_CONTEXT_HEADER = 'PRODUCTOS ENTELEQUIA';
export const DEFAULT_PRODUCTS_CONTEXT_ADDITIONAL_INFO = [
  'Informacion adicional:',
  '- Locales: Uruguay 341 (Centro) y Juramento 2584 (Belgrano)',
  '- Retiro sin cargo en tienda',
  '- Envios a todo el pais',
].join('\n');
export const DEFAULT_PRODUCTS_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Responder breve y claro, en espanol rioplatense.',
  '- Mencionar stock, precio y link cuando esten disponibles.',
  '- Si el usuario pide un tomo/numero que no aparece exacto, sugerir la edicion deluxe si existe.',
  '- Si falta informacion, pedir una sola aclaracion corta.',
].join('\n');
