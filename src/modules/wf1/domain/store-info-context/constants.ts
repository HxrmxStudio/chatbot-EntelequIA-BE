export const DEFAULT_STORE_INFO_LOCATION_CONTEXT = [
  'LOCALES ENTELEQUIA',
  '- Tenemos atención en CABA, con sucursales en la zona Centro y en Belgrano.',
  '- Si el usuario necesita la dirección exacta, sugerí abrir la web oficial o el mapa desde el sitio de Entelequia.',
  '- Si el usuario aclara sucursal, responder enfocado en esa sede (Centro o Belgrano).',
  '- No inventes direcciones ni nuevas sucursales: usá siempre la información pública del sitio oficial.',
].join('\n');

export const DEFAULT_STORE_INFO_HOURS_CONTEXT = [
  'HORARIOS DE ATENCIÓN',
  '- Manejamos horarios regulares de lunes a viernes y sábados.',
  '- No inventes horarios específicos: para feriados o fechas especiales, sugerí validar el horario actualizado en los canales oficiales.',
  '- Si la persona quiere ir hoy, sugerí siempre confirmar el horario en la web oficial o por WhatsApp antes de acercarse.',
].join('\n');

export const DEFAULT_STORE_INFO_PARKING_CONTEXT = [
  'ESTACIONAMIENTO',
  '- El acceso en auto depende de la zona y del horario.',
  '- Podés sugerir evaluar cocheras cercanas o salir con margen extra para estacionar.',
  '- Si el usuario prioriza ir en auto, orientar a la sucursal que parezca más cómoda según la zona que menciona.',
  '- No des indicaciones de tráfico en tiempo real: sugerí usar apps de mapas o navegación.',
].join('\n');

export const DEFAULT_STORE_INFO_TRANSPORT_CONTEXT = [
  'CÓMO LLEGAR',
  '- Se puede llegar en transporte público y con apps de movilidad.',
  '- Si indica desde dónde sale, sugerí opciones de llegada más prácticas usando mapas (subte, colectivos, caminar, apps).',
  '- Si está entre dos sucursales, sugerí la más conveniente según el trayecto estimado en mapas.',
  '- No inventes combinaciones exactas de transporte: orientá y recomendá usar mapas para el detalle.',
].join('\n');

export const DEFAULT_STORE_INFO_GENERAL_CONTEXT = [
  'INFORMACIÓN DE LOCALES',
  '- Te puedo ayudar con ubicación general, horarios orientativos y opciones para llegar.',
  '- Si me decís sucursal o zona, te respondo más preciso usando la información pública del sitio.',
  '- También te puedo guiar sobre la mejor forma de llegar (transporte público, auto, apps de movilidad).',
].join('\n');

export const DEFAULT_STORE_INFO_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Responder de forma clara, breve y práctica.',
  '- Si falta contexto clave (por ejemplo, desde dónde sale o a qué sucursal va), pedir una sola aclaración breve.',
  '- No inventar direcciones, horarios ni datos operativos: siempre sugerir validar en la web oficial o por WhatsApp.',
  '- Ofrecer ayuda adicional para elegir sucursal, cómo llegar y planificar la visita.',
].join('\n');
