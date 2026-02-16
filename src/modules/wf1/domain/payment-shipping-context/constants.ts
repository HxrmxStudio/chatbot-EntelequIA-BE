export const DEFAULT_PAYMENT_METHODS: string[] = [
  'Tarjetas de credito y debito',
  'Mercado Pago',
  'Paypal',
  'Transferencia bancaria',
  'Debito automatico',
  'Efectivo en local',
  'Mercado Pago QR',
];

export const DEFAULT_PAYMENT_CONTEXT = [
  'MEDIOS DE PAGO',
  '- Aceptamos tarjetas de credito y debito.',
  '- Tambien podes pagar con Mercado Pago.',
  '- Tambien podes pagar con Paypal.',
  '- Transferencia bancaria disponible en checkout.',
  '- Debito automatico disponible online.',
  '- En local: efectivo, tarjetas y Mercado Pago QR.',
].join('\n');

export const DEFAULT_SHIPPING_CONTEXT = [
  'ENVIOS',
  '- Podes elegir retiro sin cargo en tienda.',
  '- Tambien podes pedir envio a domicilio.',
  '- Tambien hacemos envios internacionales con DHL.',
  '- Cuando el pedido se despacha, te compartimos tracking.',
].join('\n');

export const DEFAULT_COST_CONTEXT = [
  'COSTOS DE ENVIO',
  '- El costo exacto se calcula en checkout segun destino y carrito.',
  '- Si queres ahorrar envio, revisa promociones vigentes.',
  '- Retiro en tienda sin cargo.',
  '- Envio gratis en compras superiores al monto promocional (a partir de $33.000).',
].join('\n');

export const DEFAULT_TIME_CONTEXT = [
  'TIEMPOS DE ENTREGA',
  '- CABA (moto): 24-48hs (entrega en el dia comprando antes de las 13hs).',
  '- Interior con Andreani: 3-5 dias habiles.',
  '- Interior con Correo Argentino: 5-7 dias habiles.',
  '- Envio internacional con DHL: menos de 4 dias habiles.',
  '- Preparacion/despacho de productos en stock: 24-48hs habiles.',
  '- Son estimados y pueden variar segun destino y operador.',
  '- Cuando se despacha, recibis seguimiento para ver el estado.',
  '- Si es preventa, la fecha estimada se informa en la ficha.',
].join('\n');

export const DEFAULT_GENERAL_CONTEXT = [
  'PAGOS Y ENVIOS',
  '- Te contamos medios de pago, opciones de envio y seguimiento.',
  '- Para costo exacto, el checkout te muestra el valor final.',
  '- Retiro sin cargo disponible.',
  '- Tambien hacemos envios internacionales con DHL.',
].join('\n');

export const DEFAULT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Responde de forma clara, breve y en espanol rioplatense.',
  '- Si preguntan costo exacto, indica que se ve en checkout.',
  '- Destaca la opcion de retiro sin cargo cuando aplique.',
  '- Ofrece ayuda adicional al final.',
  '- Si queres, ofrece ampliar detalles segun la duda puntual.',
].join('\n');

export const DEFAULT_API_FALLBACK_NOTE =
  'No pude validar promociones en tiempo real, pero te comparto la guia general.';
