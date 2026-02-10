import type { IntentResult } from '../intent';

export type Sentiment = 'negative' | 'positive' | 'neutral';

export interface OutputValidatedIntentResult extends IntentResult {
  sentiment: Sentiment;
}
