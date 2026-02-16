import { normalizeTextForSearch } from '@/common/utils/text-normalize.utils';
import type { RecommendationsMemorySnapshot } from '../recommendations/recommendations-memory';
import { isSnapshotFresh } from '../recommendations/recommendations-memory';

export interface ChallengeResolution {
  isChallenge: boolean;
  originalAnswer: string | null;
  shouldRevalidate: boolean;
}

const CHALLENGE_PATTERNS: readonly RegExp[] = [
  /\b(estas segur[oa]|est[aá]s segur[oa])\b/i,
  /\b(recien dijiste|antes dijiste|me dijiste)\b/i,
  /\b(pero.+(precio|valor|costo))\b/i,
  /\b(como puede ser|no puede ser)\b/i,
  /\b(te contradices|contradictorio)\b/i,
];

const CHALLENGE_REVALIDATE_MAX_AGE_MS = 2 * 60 * 1000;

export function detectPriceChallenge(input: {
  text: string;
  memory: Pick<RecommendationsMemorySnapshot, 'snapshotTimestamp'>;
  lastBotMessage: string | null;
}): ChallengeResolution {
  const normalized = normalizeTextForSearch(input.text);
  const isChallenge = CHALLENGE_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!isChallenge) {
    return {
      isChallenge: false,
      originalAnswer: null,
      shouldRevalidate: false,
    };
  }

  const shouldRevalidate = isSnapshotFresh(input.memory, CHALLENGE_REVALIDATE_MAX_AGE_MS);

  return {
    isChallenge: true,
    originalAnswer: input.lastBotMessage,
    shouldRevalidate,
  };
}
