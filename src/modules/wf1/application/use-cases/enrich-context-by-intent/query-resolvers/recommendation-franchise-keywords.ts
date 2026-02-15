import type { RecommendationItem } from '@/modules/wf1/domain/recommendations-context';
import {
  RECOMMENDATION_FRANCHISE_SEEDS,
  RECOMMENDATION_FRANCHISE_SEEDS_MAP,
} from '@/modules/wf1/domain/recommendations-context/franchise-seeds';
import { normalizeForToken } from './normalize';

export type RecommendationFranchiseAliases = Readonly<Record<string, readonly string[]>>;

const DYNAMIC_MIN_EVIDENCE_DEFAULT = 2;
const GENERIC_FRANCHISE_TOKENS = new Set([
  'manga',
  'mangas',
  'comic',
  'comics',
  'figura',
  'figuras',
  'remera',
  'remeras',
  'buzo',
  'buzos',
  'peluche',
  'peluches',
  'funko',
  'merk',
  'merch',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'edicion',
  'deluxe',
  'pack',
  'set',
  'vol',
  'volumen',
  'tomo',
]);

const STATIC_FRANCHISE_TERMS: RecommendationFranchiseAliases = Object.freeze(
  RECOMMENDATION_FRANCHISE_SEEDS.reduce<Record<string, readonly string[]>>((acc, seed) => {
    const terms = new Set<string>();
    terms.add(normalizeFranchiseToken(seed.query));
    for (const alias of seed.aliases) {
      terms.add(normalizeFranchiseToken(alias));
    }

    acc[seed.key] = [...terms].filter((term) => term.length > 0);
    return acc;
  }, {}),
);

const FUZZY_THRESHOLD = 2;

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

const FUZZY_MIN_TOKEN_LENGTH = 5;

function tryFuzzyMatch(
  candidate: string,
  aliasesIndex: RecommendationFranchiseAliases,
): string | null {
  if (candidate.length < FUZZY_MIN_TOKEN_LENGTH) return null;
  let best: { key: string; distance: number } | null = null;
  for (const [key, terms] of Object.entries(aliasesIndex)) {
    for (const term of terms) {
      if (term.length < FUZZY_MIN_TOKEN_LENGTH || Math.abs(term.length - candidate.length) > FUZZY_THRESHOLD) {
        continue;
      }
      const distance = levenshteinDistance(candidate, term);
      if (distance <= FUZZY_THRESHOLD && (best === null || distance < best.distance)) {
        best = { key, distance };
      }
    }
  }
  return best?.key ?? null;
}

export function resolveRecommendationFranchiseKeywords(input: {
  text: string;
  entities: string[];
  dynamicAliases?: RecommendationFranchiseAliases;
}): string[] {
  const candidates = [input.text, ...input.entities]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeFranchiseToken(value));

  if (candidates.length === 0) {
    return [];
  }

  const aliasesIndex = mergeAliasIndex(input.dynamicAliases);
  const scored: Array<{ key: string; score: number }> = [];

  for (const [key, terms] of Object.entries(aliasesIndex)) {
    const score = candidates.reduce((acc, candidate) => {
      const matchedTerms = terms.filter((term) => containsNormalizedTerm(candidate, term));
      return acc + matchedTerms.length;
    }, 0);

    if (score > 0) {
      scored.push({ key, score });
    }
  }

  if (scored.length > 0) {
    return scored
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .map((entry) => entry.key);
  }

  const tokensToTry = new Set<string>();
  for (const candidate of candidates) {
    for (const token of candidate.split(/\s+/).filter((t) => t.length >= FUZZY_MIN_TOKEN_LENGTH)) {
      tokensToTry.add(token);
    }
    if (candidate.length >= FUZZY_MIN_TOKEN_LENGTH) tokensToTry.add(candidate);
  }
  for (const token of tokensToTry) {
    const fuzzyKey = tryFuzzyMatch(token, aliasesIndex);
    if (fuzzyKey) return [fuzzyKey];
  }

  return [];
}

export function getRecommendationFranchiseTerms(
  key: string,
  dynamicAliases?: RecommendationFranchiseAliases,
): readonly string[] {
  const aliasesIndex = mergeAliasIndex(dynamicAliases);
  return aliasesIndex[key] ?? [];
}

export function resolveRecommendationFranchiseQuery(key: string): string {
  return RECOMMENDATION_FRANCHISE_SEEDS_MAP[key]?.query ?? key.replace(/_/g, ' ');
}

export function resolveRecommendationFranchiseLabel(key: string): string {
  return resolveRecommendationFranchiseQuery(key)
    .split(' ')
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

export function buildDynamicFranchiseAliases(input: {
  items: RecommendationItem[];
  minEvidence?: number;
}): RecommendationFranchiseAliases {
  const minEvidence = Math.max(2, input.minEvidence ?? DYNAMIC_MIN_EVIDENCE_DEFAULT);
  const phraseCount = new Map<string, number>();

  for (const item of input.items) {
    const itemPhrases = new Set<string>();

    for (const source of [item.title, item.slug]) {
      const phrases = extractCandidatePhrases(source);
      for (const phrase of phrases) {
        itemPhrases.add(phrase);
      }
    }

    for (const phrase of itemPhrases) {
      phraseCount.set(phrase, (phraseCount.get(phrase) ?? 0) + 1);
    }
  }

  const aliases: Record<string, readonly string[]> = {};
  for (const [phrase, count] of phraseCount.entries()) {
    if (count < minEvidence) {
      continue;
    }

    if (isGenericPhrase(phrase)) {
      continue;
    }

    const key = phrase.replace(/\s+/g, '_');
    aliases[key] = [phrase];
  }

  return Object.freeze(aliases);
}

function mergeAliasIndex(dynamicAliases?: RecommendationFranchiseAliases): RecommendationFranchiseAliases {
  if (!dynamicAliases || Object.keys(dynamicAliases).length === 0) {
    return STATIC_FRANCHISE_TERMS;
  }

  const merged: Record<string, readonly string[]> = {};

  for (const [key, terms] of Object.entries(STATIC_FRANCHISE_TERMS)) {
    merged[key] = [...terms];
  }

  for (const [key, dynamicTerms] of Object.entries(dynamicAliases)) {
    const base = merged[key] ?? [];
    const combined = new Set<string>(base);
    for (const term of dynamicTerms) {
      const normalized = normalizeFranchiseToken(term);
      if (normalized.length > 0) {
        combined.add(normalized);
      }
    }
    merged[key] = [...combined];
  }

  return merged;
}

function extractCandidatePhrases(raw: string): string[] {
  const normalized = normalizeFranchiseToken(raw).replace(/_/g, ' ');
  if (normalized.length === 0) {
    return [];
  }

  const tokens = normalized
    .split(' ')
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));

  if (tokens.length === 0) {
    return [];
  }

  const start = skipGenericPrefix(tokens);
  const meaningfulTokens = tokens.slice(start, Math.min(tokens.length, start + 3));
  if (meaningfulTokens.length === 0) {
    return [];
  }

  const phrases: string[] = [];
  for (let size = 1; size <= meaningfulTokens.length; size += 1) {
    const phrase = meaningfulTokens.slice(0, size).join(' ');
    if (phrase.length >= 3 && !isGenericPhrase(phrase)) {
      phrases.push(phrase);
    }
  }

  return phrases;
}

function skipGenericPrefix(tokens: string[]): number {
  let index = 0;
  while (index < tokens.length && GENERIC_FRANCHISE_TOKENS.has(tokens[index])) {
    index += 1;
  }

  return index;
}

function isGenericPhrase(phrase: string): boolean {
  const tokens = phrase.split(' ').filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => GENERIC_FRANCHISE_TOKENS.has(token));
}

function normalizeFranchiseToken(value: string): string {
  return normalizeForToken(value)
    .replace(/[^a-z0-9\s_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function containsNormalizedTerm(text: string, term: string): boolean {
  if (term.length === 0) {
    return false;
  }

  if (text.includes(term)) {
    return true;
  }

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}
