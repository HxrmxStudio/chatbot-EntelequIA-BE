import { INTENT_NAMES, type IntentName } from '../intent';

const allowedIntents = new Set<string>(INTENT_NAMES);

/**
 * Intent routing equivalent to the n8n Switch node, but with a safe fallback.
 *
 * - Case-sensitive.
 * - Trims whitespace to avoid silent "drop" due to accidental spaces (e.g. `" tickets"`).
 * - Falls back to `general` instead of dropping the event.
 */
export function resolveIntentRoute(intent: unknown): IntentName {
  if (typeof intent !== 'string') {
    return 'general';
  }

  const normalized = intent.trim();
  if (allowedIntents.has(normalized)) {
    return normalized as IntentName;
  }

  return 'general';
}

/**
 * Strict n8n-like routing:
 * - No normalization.
 * - Returns null if no exact match (represents n8n "None (default)" drop).
 */
export function resolveIntentRouteStrict(intent: unknown): IntentName | null {
  if (typeof intent !== 'string') {
    return null;
  }

  return allowedIntents.has(intent) ? (intent as IntentName) : null;
}
