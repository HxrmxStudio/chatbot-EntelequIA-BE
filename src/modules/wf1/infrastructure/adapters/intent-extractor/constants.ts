import { INTENT_NAMES } from '../../../domain/intent';

export const INTENT_MODEL = 'gpt-4o-mini';
export const PROMPT_VERSION = 'v1';
export const SCHEMA_NAME = 'entelequia_intent_classification';
export const MAX_ATTEMPTS = 3;
export const BASE_BACKOFF_MS = 250;
export const MAX_INPUT_CHARS = 4000;
export const INTENT_MAX_OUTPUT_TOKENS = 150;
export const INTENT_TEMPERATURE = 0.2;
export const INTENT_VERBOSITY = 'medium';
export const INTENT_PROMPT_PATH = 'prompts/entelequia_intent_system_prompt_v1.txt';
export const INTENT_SCHEMA_PATH = 'schemas/entelequia_intent_classification.schema.json';

export const DEFAULT_SYSTEM_PROMPT = [
  'Eres un clasificador de intenciones para Entelequia.',
  'Debes responder solo JSON con intent, confidence y entities.',
  `Intent permitidos: ${INTENT_NAMES.join(', ')}`,
  'Si hay ambiguedad, usa general con confidence menor a 0.7.',
].join('\n');

export const DEFAULT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: INTENT_NAMES,
    },
    confidence: {
      type: 'number',
    },
    entities: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['intent', 'confidence', 'entities'],
  additionalProperties: false,
};
