import {
  GENERIC_PRODUCTS_TOKENS,
  PRODUCT_MODIFIERS_PATTERN,
  PURE_COUNT_PATTERN,
  VOLUME_HINT_STRIP_PATTERN,
} from './patterns';
import { normalizeForToken } from './normalize';

/**
 * Removes volume hints (tomo 1, vol 2, nro 3, etc.) from a string.
 */
export function stripVolumeHints(value: string): string {
  return value.replace(VOLUME_HINT_STRIP_PATTERN, '').trim();
}

/**
 * Removes product modifiers (format, language, offer, etc.) and collapses spaces.
 */
export function stripProductModifiers(value: string): string {
  const withoutModifiers = value.replace(PRODUCT_MODIFIERS_PATTERN, '');
  return withoutModifiers.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Returns true if the value is a generic token that should not be used as the sole product query.
 */
export function isGenericProductsToken(value: string): boolean {
  const normalized = normalizeForToken(value);
  if (normalized.length === 0) return true;
  if (PURE_COUNT_PATTERN.test(normalized)) return true;
  return GENERIC_PRODUCTS_TOKENS.has(normalized);
}

/**
 * Picks the longest (most specific) entity from the list.
 */
export function pickMostSpecificEntity(entities: string[]): string {
  return entities.reduce((best, candidate) =>
    candidate.length > best.length ? candidate : best,
  );
}

/**
 * Cleans and filters product entities: trim, strip volume/modifiers, remove generic tokens.
 */
export function cleanProductsEntities(entities: string[]): string[] {
  return entities
    .map((entity) => (typeof entity === 'string' ? entity.trim() : ''))
    .filter((entity) => entity.length > 0)
    .map((entity) => stripVolumeHints(entity).trim())
    .filter((entity) => entity.length > 0)
    .map((entity) => stripProductModifiers(entity).trim())
    .filter((entity) => entity.length > 0)
    .filter((entity) => !isGenericProductsToken(entity));
}
