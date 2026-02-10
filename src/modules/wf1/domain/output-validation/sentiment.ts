import type { IntentResult } from '../intent';
import { NEGATIVE_SENTIMENT_KEYWORDS, POSITIVE_SENTIMENT_KEYWORDS } from './constants';
import type { Sentiment, OutputValidatedIntentResult } from './types';

export function detectSentiment(originalText: string): Sentiment {
  const originalTextLower = originalText.toLowerCase();

  const negativeCount = countKeywordMatches(
    originalTextLower,
    NEGATIVE_SENTIMENT_KEYWORDS,
  );
  const positiveCount = countKeywordMatches(
    originalTextLower,
    POSITIVE_SENTIMENT_KEYWORDS,
  );

  if (negativeCount > positiveCount && negativeCount > 0) {
    return 'negative';
  }

  if (positiveCount > negativeCount && positiveCount > 0) {
    return 'positive';
  }

  return 'neutral';
}

export function validateAndEnrichIntentOutput(input: {
  originalText: string;
  intentResult: IntentResult;
}): OutputValidatedIntentResult {
  return {
    ...input.intentResult,
    sentiment: detectSentiment(input.originalText),
  };
}

function countKeywordMatches(
  haystack: string,
  keywords: readonly string[],
): number {
  let count = 0;

  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      count += 1;
    }
  }

  return count;
}
