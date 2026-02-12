import { normalizeForToken } from './normalize';

interface TaxonomyEntry {
  id: string | number;
  name: string;
  slug: string;
}

export interface RecommendationEditorialMatchResult {
  matchedBrands: string[];
  matchedAuthors: string[];
  suggestedBrands: string[];
  confidence: number;
}

export function resolveRecommendationEditorialMatch(input: {
  text: string;
  entities: string[];
  brands: TaxonomyEntry[];
  authors: TaxonomyEntry[];
}): RecommendationEditorialMatchResult {
  const query = normalizeForToken([input.text, ...input.entities].join(' '));
  if (query.length === 0) {
    return {
      matchedBrands: [],
      matchedAuthors: [],
      suggestedBrands: [],
      confidence: 0,
    };
  }

  const brandScores = scoreEntries(query, input.brands);
  const authorScores = scoreEntries(query, input.authors);

  const matchedBrands = brandScores
    .filter((entry) => entry.score >= 0.3)
    .slice(0, 4)
    .map((entry) => entry.name);
  const matchedAuthors = authorScores
    .filter((entry) => entry.score >= 0.3)
    .slice(0, 3)
    .map((entry) => entry.name);
  const suggestedBrands = brandScores
    .filter((entry) => entry.score >= 0.2)
    .slice(0, 5)
    .map((entry) => entry.name);

  const confidence = Math.max(
    brandScores[0]?.score ?? 0,
    authorScores[0]?.score ?? 0,
  );

  return {
    matchedBrands,
    matchedAuthors,
    suggestedBrands,
    confidence,
  };
}

function scoreEntries(query: string, entries: TaxonomyEntry[]): Array<{ name: string; score: number }> {
  const queryTokens = splitTokens(query);
  if (queryTokens.length === 0) {
    return [];
  }

  return entries
    .map((entry) => {
      const normalizedName = normalizeForToken(entry.name);
      const normalizedSlug = normalizeForToken(entry.slug.replace(/-/g, ' '));
      const nameTokens = [...new Set(splitTokens(`${normalizedName} ${normalizedSlug}`))];
      if (nameTokens.length === 0) {
        return null;
      }

      const exactPhrase =
        query.includes(normalizedName) ||
        query.includes(normalizedSlug);
      const matchedQueryTokens = queryTokens.filter((token) => tokenExists(token, nameTokens))
        .length;
      const coverageByQuery = matchedQueryTokens / queryTokens.length;
      const coverageByName = matchedQueryTokens / nameTokens.length;
      const coverage = Math.max(coverageByQuery, coverageByName);
      const score = exactPhrase ? Math.max(coverage, 1) : coverage;

      if (score <= 0) {
        return null;
      }

      return {
        name: entry.name,
        score,
      };
    })
    .filter((entry): entry is { name: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function splitTokens(value: string): string[] {
  return value.split(/\s+/).filter((token) => token.length >= 3);
}

function tokenExists(token: string, tokens: string[]): boolean {
  if (tokens.includes(token)) {
    return true;
  }

  if (token.length < 5) {
    return false;
  }

  return tokens.some((candidate) => levenshteinDistance(token, candidate) <= 1);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  if (a.length === 0) {
    return b.length;
  }

  if (b.length === 0) {
    return a.length;
  }

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}
