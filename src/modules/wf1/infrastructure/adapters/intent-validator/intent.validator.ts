import { ensureObject } from '../../../../../common/utils/object.utils';
import {
  INTENT_NAMES,
  type IntentName,
  type IntentResult,
} from '../../../domain/intent';
import { IntentValidationError } from './errors';

const REQUIRED_KEYS = ['intent', 'confidence', 'entities'] as const;
const allowedIntents = new Set<string>(INTENT_NAMES);

export function validateAndNormalizeIntentPayload(payload: unknown): IntentResult {
  const candidate = parsePayload(payload);

  const keys = Object.keys(candidate);
  for (const key of REQUIRED_KEYS) {
    if (!keys.includes(key)) {
      throw new IntentValidationError(`Missing required field: ${key}`);
    }
  }

  for (const key of keys) {
    if (!REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number])) {
      throw new IntentValidationError(`Unexpected field: ${key}`);
    }
  }

  const intent = candidate.intent;
  if (typeof intent !== 'string' || !allowedIntents.has(intent)) {
    throw new IntentValidationError('intent must be a supported enum value');
  }

  const confidence = candidate.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    throw new IntentValidationError('confidence must be a finite number');
  }

  const entities = candidate.entities;
  if (!Array.isArray(entities) || entities.some((item) => typeof item !== 'string')) {
    throw new IntentValidationError('entities must be an array of strings');
  }

  return {
    intent: intent as IntentName,
    confidence: clamp(confidence, 0, 1),
    entities: normalizeEntities(entities),
  };
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === 'string') {
    const raw = payload.trim();
    if (raw.length === 0) {
      throw new IntentValidationError('Model output is empty');
    }

    try {
      return ensureObject(
        JSON.parse(raw) as unknown,
        'Model output must be a JSON object',
        IntentValidationError,
      );
    } catch {
      throw new IntentValidationError('Model output is not valid JSON');
    }
  }

  return ensureObject(
    payload,
    'Model output must be a JSON object',
    IntentValidationError,
  );
}

function normalizeEntities(entities: string[]): string[] {
  const deduped = new Set<string>();

  for (const entity of entities) {
    const trimmed = entity.trim();
    if (trimmed.length > 0) {
      deduped.add(trimmed);
    }
  }

  return [...deduped];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
