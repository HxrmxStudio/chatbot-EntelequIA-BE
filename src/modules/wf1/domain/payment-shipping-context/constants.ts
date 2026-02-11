export const DEFAULT_PAYMENT_METHODS: string[] = [
  'Tarjetas de credito y debito',
  'Mercado Pago',
  'Transferencia bancaria',
  'Efectivo en local',
];

export const DEFAULT_PAYMENT_CONTEXT = [
  'MEDIOS DE PAGO',
  '- Aceptamos tarjetas de credito y debito.',
  '- Tambien podes pagar con Mercado Pago.',
  '- Transferencia bancaria disponible en checkout.',
  '- En local tambien podes pagar en efectivo.',
].join('\n');

export const DEFAULT_SHIPPING_CONTEXT = [
  'ENVIOS',
  '- Podes elegir retiro sin cargo en tienda.',
  '- Tambien podes pedir envio a domicilio.',
  '- Cuando el pedido se despacha, te compartimos tracking.',
].join('\n');

export const DEFAULT_COST_CONTEXT = [
  'COSTOS DE ENVIO',
  '- El costo exacto se calcula en checkout segun destino y carrito.',
  '- Si queres ahorrar envio, revisa promociones vigentes.',
  '- Retiro en tienda sin cargo.',
].join('\n');

export const DEFAULT_TIME_CONTEXT = [
  'TIEMPOS DE ENTREGA',
  '- El tiempo depende de stock, destino y operador.',
  '- Cuando se despacha, recibis seguimiento para ver el estado.',
  '- Si es preventa, la fecha estimada se informa en la ficha.',
].join('\n');

export const DEFAULT_GENERAL_CONTEXT = [
  'PAGOS Y ENVIOS',
  '- Te contamos medios de pago, opciones de envio y seguimiento.',
  '- Para costo exacto, el checkout te muestra el valor final.',
  '- Retiro sin cargo disponible.',
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
