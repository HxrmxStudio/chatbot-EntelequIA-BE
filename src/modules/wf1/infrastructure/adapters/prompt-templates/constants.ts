/**
 * Prompt file paths.
 * Centralized paths for all prompt templates used by PromptTemplatesAdapter.
 */
export const PRODUCTS_CONTEXT_HEADER_PATH = 'prompts/entelequia_products_context_header_v1.txt';
export const PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH =
  'prompts/entelequia_products_context_additional_info_v1.txt';
export const PRODUCTS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/entelequia_products_context_instructions_v1.txt';
export const ORDERS_CONTEXT_HEADER_PATH = 'prompts/entelequia_orders_context_header_v1.txt';
export const ORDERS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/entelequia_orders_context_instructions_v1.txt';
export const ORDER_DETAIL_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/entelequia_order_detail_context_instructions_v1.txt';
export const ORDERS_EMPTY_CONTEXT_MESSAGE_PATH =
  'prompts/entelequia_orders_empty_context_v1.txt';
export const PAYMENT_SHIPPING_PAYMENT_CONTEXT_PATH =
  'prompts/entelequia_payment_shipping_payment_context_v1.txt';
export const PAYMENT_SHIPPING_SHIPPING_CONTEXT_PATH =
  'prompts/entelequia_payment_shipping_shipping_context_v1.txt';
export const PAYMENT_SHIPPING_COST_CONTEXT_PATH =
  'prompts/entelequia_payment_shipping_cost_context_v1.txt';
export const PAYMENT_SHIPPING_TIME_CONTEXT_PATH =
  'prompts/entelequia_payment_shipping_time_context_v1.txt';
export const PAYMENT_SHIPPING_GENERAL_CONTEXT_PATH =
  'prompts/entelequia_payment_shipping_general_context_v1.txt';
export const PAYMENT_SHIPPING_INSTRUCTIONS_PATH =
  'prompts/entelequia_payment_shipping_instructions_v1.txt';
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
export const DEFAULT_ORDERS_CONTEXT_HEADER = 'TUS ULTIMOS PEDIDOS';
export const DEFAULT_ORDERS_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Mostrar los pedidos de forma clara y ordenada.',
  '- Si preguntan por un pedido especifico, enfocarte en ese pedido.',
  '- Si hay tracking, mencionarlo.',
  '- Si no hay tracking, aclarar que se notifica por email.',
].join('\n');
export const DEFAULT_ORDER_DETAIL_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Informar el estado del pedido de forma clara.',
  '- Si hay tracking, compartirlo.',
  '- Si no hay tracking, aclarar que se notificara por email.',
  '- Ofrecer ayuda adicional si necesita soporte.',
].join('\n');
export const DEFAULT_ORDERS_EMPTY_CONTEXT_MESSAGE =
  'No encontramos pedidos en tu cuenta. Si hiciste una compra recientemente, puede tardar unos minutos en aparecer.';
export const DEFAULT_PAYMENT_SHIPPING_PAYMENT_CONTEXT = [
  'MEDIOS DE PAGO',
  '- Aceptamos tarjetas de credito y debito.',
  '- Tambien podes pagar con Mercado Pago.',
  '- Transferencia bancaria disponible en checkout.',
  '- En local tambien podes pagar en efectivo.',
].join('\n');
export const DEFAULT_PAYMENT_SHIPPING_SHIPPING_CONTEXT = [
  'ENVIOS',
  '- Podes elegir retiro sin cargo en tienda.',
  '- Tambien podes pedir envio a domicilio.',
  '- Cuando el pedido se despacha, te compartimos tracking.',
].join('\n');
export const DEFAULT_PAYMENT_SHIPPING_COST_CONTEXT = [
  'COSTOS DE ENVIO',
  '- El costo exacto se calcula en checkout segun destino y carrito.',
  '- Si queres ahorrar envio, revisa promociones vigentes.',
  '- Retiro en tienda sin cargo.',
].join('\n');
export const DEFAULT_PAYMENT_SHIPPING_TIME_CONTEXT = [
  'TIEMPOS DE ENTREGA',
  '- El tiempo depende de stock, destino y operador.',
  '- Cuando se despacha, recibis seguimiento para ver el estado.',
  '- Si es preventa, la fecha estimada se informa en la ficha.',
].join('\n');
export const DEFAULT_PAYMENT_SHIPPING_GENERAL_CONTEXT = [
  'PAGOS Y ENVIOS',
  '- Te contamos medios de pago, opciones de envio y seguimiento.',
  '- Para costo exacto, el checkout te muestra el valor final.',
  '- Retiro sin cargo disponible.',
].join('\n');
export const DEFAULT_PAYMENT_SHIPPING_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Responde de forma clara, breve y en espanol rioplatense.',
  '- Si preguntan costo exacto, indica que se ve en checkout.',
  '- Destaca la opcion de retiro sin cargo cuando aplique.',
  '- Ofrece ayuda adicional al final.',
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
