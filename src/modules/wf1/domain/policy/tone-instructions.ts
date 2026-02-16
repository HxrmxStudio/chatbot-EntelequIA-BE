/**
 * Tone and style instructions - Single Source of Truth
 * 
 * Central location for all tone, style, and instruction patterns
 * used across prompts and context blocks.
 */

export const TONE_RIOPLATENSE = 'Responder breve y claro, en espanol rioplatense';

export const SINGLE_CLARIFICATION = 'pedir una sola aclaracion corta';

export const INSTRUCTION_HEADER = 'Instrucciones para tu respuesta:';

/**
 * Common instruction patterns
 */
export const COMMON_INSTRUCTIONS = {
  tone: TONE_RIOPLATENSE,
  clarification: SINGLE_CLARIFICATION,
  header: INSTRUCTION_HEADER,
  brief: 'Responde breve y directo',
  noInventData: 'No inventes datos, precios, stock, horarios ni disponibilidad',
  oneQuestion: 'Si necesitas mas contexto, pedi una sola aclaracion corta',
} as const;
