import type { DetectedProductCategory, ResolvedProductsQuery } from './types';
import {
  BOARD_DICE_HINT_PATTERN,
  BOARD_PUZZLE_HINT_PATTERN,
  FORMAT_HINT_PATTERN,
  LANGUAGE_HINT_PATTERN,
  MERCH_BUZOS_HINT_PATTERN,
  MERCH_COSPLAY_HINT_PATTERN,
  MERCH_FUNKO_HINT_PATTERN,
  MERCH_GORRAS_HINT_PATTERN,
  MERCH_PLUSH_HINT_PATTERN,
  MERCH_REMERAS_HINT_PATTERN,
  OFFER_HINT_PATTERN,
  TCG_ACCESSORIES_HINT_PATTERN,
  TCG_DIGIMON_HINT_PATTERN,
  TCG_MAGIC_HINT_PATTERN,
  TCG_POKEMON_HINT_PATTERN,
  TCG_YUGIOH_HINT_PATTERN,
  VOLUME_HINT_PATTERN,
} from './patterns';
import {
  SLUG_BUZOS,
  SLUG_COMICS,
  SLUG_DADOS,
  SLUG_DIGIMON,
  SLUG_FUNKO_POPS,
  SLUG_JUEGOS,
  SLUG_JUEGOS_JUEGOS_DE_MESA,
  SLUG_JUEGOS_JUEGOS_DE_ROL,
  SLUG_LIBROS,
  SLUG_MANGAS,
  SLUG_MERCHANDISING,
  SLUG_MERCHANDISING_FIGURAS,
  SLUG_MERCHANDISING_PELUCHES,
  SLUG_MERCHANDISING_ROPA,
  SLUG_ROPA_COSPLAY,
  SLUG_ROPA_GORRAS,
  SLUG_ROPA_REMERAS,
  SLUG_ROMECABEZAS,
  SLUG_TAROT_Y_MAGIA,
  SLUG_TCG_ACCESORIOS,
  SLUG_TCG_GENERIC,
  SLUG_TCG_MAGIC,
  SLUG_TCG_POKEMON,
  SLUG_TCG_YUGIOH,
} from './category-slugs';
import { normalizeTextForSearch } from '@/common/utils/text-normalize.utils';
import { normalizeForToken } from './normalize';
import { cleanProductsEntities, pickMostSpecificEntity, stripProductModifiers, stripVolumeHints } from './clean-entities';
import { detectProductCategory } from './detect-category';

function resolveByHints(
  text: string,
  pairs: ReadonlyArray<{ pattern: RegExp; slug: string }>,
  defaultSlug: string,
): string {
  for (const { pattern, slug } of pairs) {
    if (pattern.test(text)) return slug;
  }
  return defaultSlug;
}

function resolveCategorySlug(
  category: DetectedProductCategory | null,
  normalizedOriginalText: string,
): string | undefined {
  if (!category) return undefined;

  switch (category) {
    case 'manga':
      return SLUG_MANGAS;
    case 'comic':
      return SLUG_COMICS;
    case 'libro':
      return SLUG_LIBROS;
    case 'tarot':
      return SLUG_TAROT_Y_MAGIA;
    case 'juego_mesa':
      return resolveByHints(normalizedOriginalText, [
        { pattern: BOARD_PUZZLE_HINT_PATTERN, slug: SLUG_ROMECABEZAS },
        { pattern: BOARD_DICE_HINT_PATTERN, slug: SLUG_DADOS },
      ], SLUG_JUEGOS_JUEGOS_DE_MESA);
    case 'juego_rol':
      return SLUG_JUEGOS_JUEGOS_DE_ROL;
    case 'juego_tcg':
      return resolveByHints(normalizedOriginalText, [
        { pattern: TCG_ACCESSORIES_HINT_PATTERN, slug: SLUG_TCG_ACCESORIOS },
        { pattern: TCG_MAGIC_HINT_PATTERN, slug: SLUG_TCG_MAGIC },
        { pattern: TCG_YUGIOH_HINT_PATTERN, slug: SLUG_TCG_YUGIOH },
        { pattern: TCG_POKEMON_HINT_PATTERN, slug: SLUG_TCG_POKEMON },
        { pattern: TCG_DIGIMON_HINT_PATTERN, slug: SLUG_DIGIMON },
      ], SLUG_TCG_GENERIC);
    case 'merch_ropa':
      return resolveByHints(normalizedOriginalText, [
        { pattern: MERCH_REMERAS_HINT_PATTERN, slug: SLUG_ROPA_REMERAS },
        { pattern: MERCH_GORRAS_HINT_PATTERN, slug: SLUG_ROPA_GORRAS },
        { pattern: MERCH_COSPLAY_HINT_PATTERN, slug: SLUG_ROPA_COSPLAY },
        { pattern: MERCH_BUZOS_HINT_PATTERN, slug: SLUG_BUZOS },
      ], SLUG_MERCHANDISING_ROPA);
    case 'merch_figuras':
      return resolveByHints(normalizedOriginalText, [
        { pattern: MERCH_FUNKO_HINT_PATTERN, slug: SLUG_FUNKO_POPS },
        { pattern: MERCH_PLUSH_HINT_PATTERN, slug: SLUG_MERCHANDISING_PELUCHES },
      ], SLUG_MERCHANDISING_FIGURAS);
    case 'juego':
      return SLUG_JUEGOS;
    case 'merch':
      return SLUG_MERCHANDISING;
    default:
      return undefined;
  }
}

/**
 * Resolves a products query from NER entities and original text.
 * Returns product name, category, cleaned entities, and hint flags for volume/format/language/offer.
 *
 * @param entities - Extracted entities from intent (e.g. product names, formats)
 * @param originalText - Raw user message
 * @returns Resolved query with metadata
 */
export function resolveProductsQuery(
  entities: string[],
  originalText: string,
): ResolvedProductsQuery {
  const originalEntities = [...entities];
  const cleanedEntities = cleanProductsEntities(entities);

  const normalized = normalizeTextForSearch(originalText);
  const hasOr =
    /\b(o|u)\b/.test(normalized) && !/\b(otro|o sea)\b/.test(normalized);

  const fallbackProductName = stripProductModifiers(stripVolumeHints(originalText)).trim();
  const productName =
    cleanedEntities.length > 0
      ? pickMostSpecificEntity(cleanedEntities)
      : fallbackProductName;

  const hasMultipleQueries =
    (hasOr || cleanedEntities.length > 1) && cleanedEntities.length > 0;
  const productNames = hasMultipleQueries
    ? cleanedEntities
    : [productName];

  const normalizedOriginalText = normalizeForToken(originalText);
  const category = detectProductCategory(originalText);

  return {
    productNames,
    productName,
    category,
    categorySlug: resolveCategorySlug(category, normalizedOriginalText),
    originalEntities,
    cleanedEntities,
    hasVolumeHint: VOLUME_HINT_PATTERN.test(normalizedOriginalText),
    hasFormatHint: FORMAT_HINT_PATTERN.test(normalizedOriginalText),
    hasLanguageHint: LANGUAGE_HINT_PATTERN.test(normalizedOriginalText),
    hasOfferHint: OFFER_HINT_PATTERN.test(normalizedOriginalText),
    hasMultipleQueries,
  };
}
