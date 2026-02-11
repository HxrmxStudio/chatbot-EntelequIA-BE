/**
 * Prompt file paths.
 * Centralized paths for all prompt templates used by PromptTemplatesAdapter.
 */
export const PRODUCTS_CONTEXT_HEADER_PATH = 'prompts/products/entelequia_products_context_header_v1.txt';
export const PRODUCTS_CONTEXT_ADDITIONAL_INFO_PATH =
  'prompts/products/entelequia_products_context_additional_info_v1.txt';
export const PRODUCTS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/products/entelequia_products_context_instructions_v1.txt';
export const ORDERS_CONTEXT_HEADER_PATH = 'prompts/orders/entelequia_orders_context_header_v1.txt';
export const ORDERS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/orders/entelequia_orders_context_instructions_v1.txt';
export const ORDER_DETAIL_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/orders/entelequia_order_detail_context_instructions_v1.txt';
export const ORDERS_EMPTY_CONTEXT_MESSAGE_PATH =
  'prompts/orders/entelequia_orders_empty_context_v1.txt';
export const PAYMENT_SHIPPING_PAYMENT_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_payment_context_v1.txt';
export const PAYMENT_SHIPPING_SHIPPING_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_shipping_context_v1.txt';
export const PAYMENT_SHIPPING_COST_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_cost_context_v1.txt';
export const PAYMENT_SHIPPING_TIME_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_time_context_v1.txt';
export const PAYMENT_SHIPPING_GENERAL_CONTEXT_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_general_context_v1.txt';
export const PAYMENT_SHIPPING_INSTRUCTIONS_PATH =
  'prompts/payment-shipping/entelequia_payment_shipping_instructions_v1.txt';
export const RECOMMENDATIONS_CONTEXT_HEADER_PATH =
  'prompts/recommendations/entelequia_recommendations_context_header_v1.txt';
export const RECOMMENDATIONS_CONTEXT_WHY_THESE_PATH =
  'prompts/recommendations/entelequia_recommendations_context_why_these_v1.txt';
export const RECOMMENDATIONS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/recommendations/entelequia_recommendations_context_instructions_v1.txt';
export const RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE_PATH =
  'prompts/recommendations/entelequia_recommendations_empty_context_v1.txt';
export const TICKETS_CONTEXT_HEADER_PATH =
  'prompts/tickets/entelequia_tickets_context_header_v1.txt';
export const TICKETS_CONTACT_OPTIONS_PATH =
  'prompts/tickets/entelequia_tickets_contact_options_v1.txt';
export const TICKETS_HIGH_PRIORITY_NOTE_PATH =
  'prompts/tickets/entelequia_tickets_high_priority_note_v1.txt';
export const TICKETS_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/tickets/entelequia_tickets_context_instructions_v1.txt';
export const STORE_INFO_LOCATION_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_location_context_v1.txt';
export const STORE_INFO_HOURS_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_hours_context_v1.txt';
export const STORE_INFO_PARKING_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_parking_context_v1.txt';
export const STORE_INFO_TRANSPORT_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_transport_context_v1.txt';
export const STORE_INFO_GENERAL_CONTEXT_PATH =
  'prompts/store-info/entelequia_store_info_general_context_v1.txt';
export const STORE_INFO_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/store-info/entelequia_store_info_context_instructions_v1.txt';
export const GENERAL_CONTEXT_HINT_PATH = 'prompts/general/entelequia_general_context_hint_v1.txt';
export const GENERAL_CONTEXT_INSTRUCTIONS_PATH =
  'prompts/general/entelequia_general_context_instructions_v1.txt';
export const STATIC_CONTEXT_PATH = 'prompts/static/entelequia_static_context_v1.txt';

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
  '- Mencionar disponibilidad (hay stock / quedan pocas unidades / sin stock), precio y link cuando esten disponibles.',
  '- Solo compartir cantidad exacta de unidades si el usuario lo pide explicitamente.',
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
export const DEFAULT_RECOMMENDATIONS_CONTEXT_HEADER = 'RECOMENDACIONES PERSONALIZADAS';
export const DEFAULT_RECOMMENDATIONS_CONTEXT_WHY_THESE = [
  'Por que estos productos:',
  '- Seleccionados segun tus preferencias.',
  '- Priorizan disponibilidad inmediata.',
  '- Son sugerencias destacadas del catalogo.',
].join('\n');
export const DEFAULT_RECOMMENDATIONS_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Presenta recomendaciones en tono cercano y entusiasta.',
  '- Si el usuario menciono preferencias, conectalas explicitamente.',
  '- Pregunta si quiere mas opciones o detalle de algun producto.',
  '- Ofrece ayuda para decidir entre alternativas.',
].join('\n');
export const DEFAULT_RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE =
  'En este momento no tengo recomendaciones especificas para ese filtro, pero si queres te puedo mostrar ultimos lanzamientos.';
export const DEFAULT_TICKETS_CONTEXT_HEADER = 'SOPORTE TECNICO';
export const DEFAULT_TICKETS_CONTACT_OPTIONS = [
  'Que podes hacer ahora:',
  '- Te ayudo a derivar el caso por canales oficiales.',
  '- Si aplica, tenes que preparar numero de pedido y descripcion del problema.',
  '- Si es urgente, conviene priorizar contacto humano directo.',
].join('\n');
export const DEFAULT_TICKETS_HIGH_PRIORITY_NOTE = [
  'Prioridad alta detectada:',
  '- Recomenda contacto humano inmediato y seguimiento cercano.',
].join('\n');
export const DEFAULT_TICKETS_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Mostrar empatia y contencion.',
  '- Ofrecer opciones de contacto oficiales.',
  '- No prometer resoluciones especificas desde el chat.',
  '- No pedir credenciales ni datos sensibles.',
].join('\n');
export const DEFAULT_STORE_INFO_LOCATION_CONTEXT = [
  'LOCALES ENTELEQUIA',
  '- Tenemos atencion en CABA (Centro y Belgrano).',
  '- Si quiere direccion exacta, sugeri web oficial o mapas.',
].join('\n');
export const DEFAULT_STORE_INFO_HOURS_CONTEXT = [
  'HORARIOS DE ATENCION',
  '- Hay horarios regulares en semana y sabados.',
  '- Para feriados o fechas especiales, sugeri validar horarios actualizados.',
].join('\n');
export const DEFAULT_STORE_INFO_PARKING_CONTEXT = [
  'ESTACIONAMIENTO',
  '- El acceso en auto depende de zona y horario.',
  '- Recomendar planificar cochera o margen extra para estacionar.',
].join('\n');
export const DEFAULT_STORE_INFO_TRANSPORT_CONTEXT = [
  'COMO LLEGAR',
  '- Se puede llegar por transporte publico y apps de movilidad.',
  '- Si indica origen, sugeri opcion mas conveniente.',
].join('\n');
export const DEFAULT_STORE_INFO_GENERAL_CONTEXT = [
  'INFORMACION DE LOCALES',
  '- Te puedo ayudar con ubicacion, horarios y como llegar.',
  '- Si me decis sucursal o zona, te respondo mas preciso.',
].join('\n');
export const DEFAULT_STORE_INFO_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Responder claro y practico.',
  '- Si falta detalle, pedir una sola aclaracion corta.',
  '- Ofrecer ayuda adicional.',
].join('\n');
export const DEFAULT_GENERAL_CONTEXT_HINT =
  'Responder con claridad y pedir precision cuando falten datos.';
export const DEFAULT_GENERAL_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Responder breve, amigable y en espanol rioplatense.',
  '- Si la consulta es ambigua, pedir una aclaracion concreta.',
  '- Ofrecer siempre el siguiente paso de ayuda.',
].join('\n');
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
