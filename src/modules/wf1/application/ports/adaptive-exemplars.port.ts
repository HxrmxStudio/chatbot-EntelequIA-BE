import type { IntentName } from '../../domain/intent';

export interface AdaptiveExemplar {
  intent: IntentName;
  promptHint: string;
  confidenceWeight: number;
}

export interface AdaptiveExemplarsPort {
  getActiveExemplarsByIntent(input: {
    intent: IntentName;
    limit: number;
  }): Promise<AdaptiveExemplar[]>;
}
