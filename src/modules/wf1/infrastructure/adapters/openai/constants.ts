export const MAX_ATTEMPTS = 3;
export const BASE_BACKOFF_MS = 250;
export const ASSISTANT_PROMPT_PATH = 'prompts/system/entelequia_assistant_system_prompt_v1.txt';
export const ASSISTANT_SCHEMA_PATH = 'schemas/entelequia_assistant_reply.schema.json';
export const ASSISTANT_SCHEMA_NAME = 'entelequia_assistant_reply';
export const ASSISTANT_SCHEMA_VERSION = '1.0';
export const ASSISTANT_PROMPT_VERSION = 'assistant_v2';
export const ASSISTANT_TEMPERATURE = 0.2;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 240;
export const PROMPT_HISTORY_MAX_ITEMS = 6;
export const PROMPT_HISTORY_ITEM_MAX_CHARS = 280;
export const PROMPT_CONTEXT_MAX_CHARS = 5000;
export const DEFAULT_SYSTEM_PROMPT = [
  '# Rol y objetivo',
  'Sos el asistente virtual de Entelequia.',
  'Tu objetivo es resolver consultas con precision, utilidad y claridad, en espanol rioplatense.',
  '',
  '# Reglas de respuesta',
  '- Usa solo informacion confirmada en el contexto.',
  '- Si falta un dato clave, decilo explicitamente y pedi una sola aclaracion corta.',
  '- No inventes datos.',
  '',
  '# Reglas por caso',
  '- Para stock, usa: "hay stock", "quedan pocas unidades" o "sin stock".',
  '- Solo mostrar cantidad exacta si el usuario la pide explicitamente.',
  '- Si preguntan si sos IA, responder: "Soy el asistente virtual de Entelequia".',
  '',
  '# Que NO hacer',
  '- No exponer detalles tecnicos internos del sistema.',
].join('\n');

export const DEFAULT_ASSISTANT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      minLength: 1,
      maxLength: 1200,
    },
    requires_clarification: {
      type: 'boolean',
    },
    clarifying_question: {
      type: ['string', 'null'],
      maxLength: 300,
    },
    confidence_label: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    _schema_version: {
      type: 'string',
      const: ASSISTANT_SCHEMA_VERSION,
    },
  },
  required: [
    'reply',
    'requires_clarification',
    'clarifying_question',
    'confidence_label',
    '_schema_version',
  ],
};
