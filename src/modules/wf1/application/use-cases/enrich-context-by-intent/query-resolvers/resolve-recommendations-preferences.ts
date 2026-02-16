import {
  detectRecommendationType,
  RECOMMENDATIONS_TYPE_PRIORITY,
  type RecommendationPreferences,
  type RecommendationTypeKey,
} from '@/modules/wf1/domain/recommendations-context';
import { detectProductCategory } from './detect-category';
import { normalizeForToken } from './normalize';
import { resolveRecommendationFranchiseKeywords } from './recommendation-franchise-keywords';
import type { DetectedProductCategory } from './types';

const GENRE_PATTERNS: ReadonlyArray<{ genre: string; pattern: RegExp }> = [
  { genre: 'accion', pattern: /\baccion\b/ },
  { genre: 'aventura', pattern: /\baventura\b/ },
  { genre: 'fantasia', pattern: /\bfantasia\b/ },
  { genre: 'terror', pattern: /\bterror\b/ },
  { genre: 'romance', pattern: /\bromance\b/ },
  { genre: 'ciencia ficcion', pattern: /\b(ciencia\s*ficcion|sci\s*fi)\b/ },
  { genre: 'slice of life', pattern: /\bslice\s+of\s+life\b/ },
  { genre: 'shonen', pattern: /\bshonen\b/ },
  { genre: 'seinen', pattern: /\bseinen\b/ },
  { genre: 'shojo', pattern: /\bshojo\b/ },
];

const AGE_PATTERN = /\b(?:para|de|tengo|edad\s+de)\s*(\d{1,2})\s*anos?\b/;

const PRICE_PREFERENCE_PATTERNS: readonly RegExp[] = [
  /\b(barat[oa]s?|economico|econ[oó]mico|economica|econ[oó]mica|economicas|econ[oó]micas)\b/i,
  /\bpresupuesto\b/i,
  /\b(algo|opciones?)\s+(barat[oa]s?|economico|econ[oó]mico|economica|econ[oó]mica)\b/i,
  /\b(necesito|quiero|busco)\s+algo\s+barat[oa]\b/i,
];

export function resolveRecommendationsPreferences(input: {
  text: string;
  entities: string[];
}): RecommendationPreferences {
  const normalizedText = normalizeForToken(input.text);
  const franchiseKeywords = resolveRecommendationFranchiseKeywords(input);
  const genre = detectGenres(normalizedText);
  const type = detectTypes(input.text, input.entities);
  const age = detectAge(normalizedText);
  const prefersLowPrice = PRICE_PREFERENCE_PATTERNS.some((p) => p.test(normalizedText));

  return {
    franchiseKeywords,
    genre,
    type,
    age,
    prefersLowPrice,
  };
}

function detectGenres(normalizedText: string): string[] {
  const genres: string[] = [];

  for (const { genre, pattern } of GENRE_PATTERNS) {
    if (pattern.test(normalizedText)) {
      genres.push(genre);
    }
  }

  return genres;
}

function detectTypes(text: string, entities: string[]): string[] {
  const recommendationTypeSet = new Set<RecommendationTypeKey>();
  const candidates = [text, ...entities];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    const recommendationType = detectRecommendationType(candidate);
    if (recommendationType) {
      recommendationTypeSet.add(recommendationType);
    }
  }

  if (recommendationTypeSet.size > 0) {
    return RECOMMENDATIONS_TYPE_PRIORITY.filter((type) =>
      recommendationTypeSet.has(type),
    );
  }

  const fallbackTypeSet = new Set<RecommendationTypeKey>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    const category = detectProductCategory(candidate);
    if (!category) {
      continue;
    }

    fallbackTypeSet.add(mapCategoryToPreferenceType(category));
  }

  return RECOMMENDATIONS_TYPE_PRIORITY.filter((type) => fallbackTypeSet.has(type));
}

function detectAge(normalizedText: string): number | null {
  const match = normalizedText.match(AGE_PATTERN);
  if (!match || !match[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function mapCategoryToPreferenceType(
  category: DetectedProductCategory,
): RecommendationTypeKey {
  switch (category) {
    case 'manga':
      return 'mangas';
    case 'comic':
      return 'comics';
    case 'libro':
      return 'libros';
    case 'tarot':
      return 'tarot_y_magia';
    case 'juego_tcg':
      return 'juego_tcg_generico';
    case 'merch_ropa':
      return 'merch_ropa_generico';
    default:
      return category;
  }
}
