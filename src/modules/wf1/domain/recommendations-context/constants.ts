export const WF1_RECOMMENDATIONS_CONTEXT_AI_MAX_ITEMS = 5;

export const DEFAULT_RECOMMENDATIONS_CONTEXT_HEADER = 'RECOMENDACIONES PERSONALIZADAS';

export const DEFAULT_RECOMMENDATIONS_CONTEXT_WHY_THESE = [
  'Por que estos productos:',
  '- Se seleccionaron segun lo que contaste.',
  '- Son opciones destacadas del catalogo.',
  '- Priorizamos productos con stock disponible.',
].join('\n');

export const DEFAULT_RECOMMENDATIONS_CONTEXT_INSTRUCTIONS = [
  'Instrucciones para tu respuesta:',
  '- Presenta las recomendaciones con tono cercano y claro.',
  '- Conecta la sugerencia con la preferencia del usuario cuando aplique.',
  '- Pregunta si quiere mas opciones o detalle de algun producto.',
  '- Ofrece ayuda para decidir entre alternativas.',
].join('\n');

export const DEFAULT_RECOMMENDATIONS_EMPTY_CONTEXT_MESSAGE =
  'En este momento no tengo recomendaciones especificas para ese filtro, pero si queres te puedo mostrar ultimos lanzamientos.';

export const DEFAULT_RECOMMENDATIONS_API_FALLBACK_NOTE =
  'No pude consultar recomendaciones en tiempo real, pero te dejo una guia para seguir.';

