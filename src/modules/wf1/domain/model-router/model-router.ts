import type { IntentName } from '../intent';

export interface ModelRouteInput {
  intent: IntentName;
  messageLength: number;
  hasMultiTurnContext: boolean;
  containsComplexSignals: boolean;
}

export interface ModelRouteDecision {
  selectedModel: 'gpt-4.1-nano' | 'gpt-4.1-mini';
  fallbackModel: 'gpt-4.1-mini';
  reason:
    | 'complex_intent'
    | 'complex_signal'
    | 'long_message'
    | 'multiturn'
    | 'simple_default';
}

const SIMPLE_INTENTS = new Set<IntentName>([
  'orders',
  'payment_shipping',
  'store_info',
  'general',
]);

const COMPLEX_INTENTS = new Set<IntentName>(['recommendations', 'tickets', 'products']);
const LONG_MESSAGE_THRESHOLD = 180;

export function routeModel(input: ModelRouteInput): ModelRouteDecision {
  if (COMPLEX_INTENTS.has(input.intent)) {
    return {
      selectedModel: 'gpt-4.1-mini',
      fallbackModel: 'gpt-4.1-mini',
      reason: 'complex_intent',
    };
  }

  if (input.containsComplexSignals) {
    return {
      selectedModel: 'gpt-4.1-mini',
      fallbackModel: 'gpt-4.1-mini',
      reason: 'complex_signal',
    };
  }

  if (input.messageLength > LONG_MESSAGE_THRESHOLD) {
    return {
      selectedModel: 'gpt-4.1-mini',
      fallbackModel: 'gpt-4.1-mini',
      reason: 'long_message',
    };
  }

  if (input.hasMultiTurnContext && input.intent !== 'general') {
    return {
      selectedModel: 'gpt-4.1-mini',
      fallbackModel: 'gpt-4.1-mini',
      reason: 'multiturn',
    };
  }

  if (SIMPLE_INTENTS.has(input.intent)) {
    return {
      selectedModel: 'gpt-4.1-nano',
      fallbackModel: 'gpt-4.1-mini',
      reason: 'simple_default',
    };
  }

  return {
    selectedModel: 'gpt-4.1-mini',
    fallbackModel: 'gpt-4.1-mini',
    reason: 'complex_intent',
  };
}

export function detectComplexSignals(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }

  const COMPLEX_PATTERNS = [
    /recomend(?:ame|ame|acion|aciones)/,
    /\bcompar(?:a|ar|ame)\b/,
    /\bproblema\b/,
    /\bconflicto\b/,
    /\bmejor\b/,
    /\bpeor\b/,
  ];

  return COMPLEX_PATTERNS.some((pattern) => pattern.test(normalized));
}

