import type { ResolvedProductsQuery } from './types';
import {
  FORMAT_HINT_PATTERN,
  LANGUAGE_HINT_PATTERN,
  OFFER_HINT_PATTERN,
  VOLUME_HINT_PATTERN,
} from './patterns';
import { normalizeForToken } from './normalize';
import { cleanProductsEntities, pickMostSpecificEntity, stripProductModifiers, stripVolumeHints } from './clean-entities';
import { detectProductCategory } from './detect-category';

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

  const fallbackProductName = stripProductModifiers(stripVolumeHints(originalText)).trim();
  const productName =
    cleanedEntities.length > 0
      ? pickMostSpecificEntity(cleanedEntities)
      : fallbackProductName;

  const normalizedOriginalText = normalizeForToken(originalText);

  return {
    productName,
    category: detectProductCategory(originalText),
    originalEntities,
    cleanedEntities,
    hasVolumeHint: VOLUME_HINT_PATTERN.test(normalizedOriginalText),
    hasFormatHint: FORMAT_HINT_PATTERN.test(normalizedOriginalText),
    hasLanguageHint: LANGUAGE_HINT_PATTERN.test(normalizedOriginalText),
    hasOfferHint: OFFER_HINT_PATTERN.test(normalizedOriginalText),
  };
}
