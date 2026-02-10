/**
 * Prompt file paths.
 * Centralized paths for all prompt templates used by PromptTemplatesAdapter.
 */
export const PRODUCTS_CONTEXT_HEADER_PATH = 'prompts/entelequia_products_context_header_v1.txt';
export const PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH =
  'prompts/entelequia_products_context_additional_info_v1.txt';
export const PRODUCTS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/entelequia_products_context_instructions_v1.txt';
export const GENERAL_CONTEXT_HINT_PATH = 'prompts/entelequia_general_context_hint_v1.txt';
export const STATIC_CONTEXT_PATH = 'prompts/entelequia_static_context_v1.txt';

/**
 * Default prompt content fallbacks.
 * Used when prompt files cannot be loaded from filesystem.
 */
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
export const DEFAULT_GENERAL_CONTEXT_HINT =
  'Responder con claridad y pedir precision cuando falten datos.';
export const DEFAULT_STATIC_CONTEXT = [
  'LOCALES',
  '- Uruguay 341 (Centro)',
  '- Juramento 2584 (Belgrano)',
  '',
  'COMPRA Y ENVIOS',
  '- Retiro sin cargo en tienda',
  '- Envios a todo el pais',
  '- Consultas: WhatsApp o web',
  '',
  'CONTACTO',
  '- WhatsApp: +54 9 11 6189-8533 (Lun-Vie 10-19hs)',
  '- Email: info@entelequia.com.ar / belgrano@entelequia.com.ar',
  '- Tiempo de respuesta: 24-48hs habiles',
  '- Para urgencias: llama por telefono directo a los locales',
].join('\n');

