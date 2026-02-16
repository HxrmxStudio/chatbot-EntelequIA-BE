/**
 * Text normalization utilities for consistent text processing across the application.
 *
 * These functions consolidate 8 different normalizeText implementations found across the codebase
 * into 3 well-defined variants with clear semantics.
 */

/**
 * Basic normalization: only trims whitespace.
 * Use for cases where you need minimal processing (e.g., intent extraction).
 */
export function normalizeTextBasic(text: string): string {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Standard normalization for search and comparison:
 * - Converts to lowercase
 * - Removes diacritics/accents (e.g., "ñ" -> "n", "á" -> "a")
 * - Allows word characters (\w: a-z, A-Z, 0-9, _) and spaces
 * - Collapses multiple spaces into single space
 * - Trims leading/trailing whitespace
 *
 * Use this for most text comparison and search scenarios.
 */
export function normalizeTextForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict normalization for exact matching and pattern detection:
 * - Converts to lowercase
 * - Removes diacritics/accents
 * - Allows only alphanumeric (a-z, 0-9) and spaces (no underscores, no special chars)
 * - Collapses multiple spaces into single space
 * - Trims leading/trailing whitespace
 *
 * Use for deterministic pattern matching where strict character control is needed.
 *
 * @param allowHash - If true, allows '#' character (for order ID matching). Defaults to false.
 */
export function normalizeTextStrict(text: string, allowHash = false): string {
  const pattern = allowHash ? /[^a-z0-9\s#]/g : /[^a-z0-9\s]/g;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(pattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalization with repeated character removal:
 * - Same as normalizeTextForSearch
 * - Additionally reduces 3+ repeated characters to 2 (e.g., "holaaaa" -> "holaa")
 *
 * Use for user input where repeated characters might indicate emphasis or typos.
 */
export function normalizeTextWithRepeatedCharRemoval(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if text contains a normalized term as a whole word (word boundaries).
 * Use when you need to avoid substring matches (e.g. "devolucion" should not match "devolucionar").
 * For multi-word terms (containing space), uses simple substring match.
 */
export function containsNormalizedTerm(text: string, normalizedTerm: string): boolean {
  if (normalizedTerm.length === 0) {
    return false;
  }

  if (text === normalizedTerm) {
    return true;
  }

  if (normalizedTerm.includes(' ')) {
    return text.includes(normalizedTerm);
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}

/**
 * Checks if text contains any of the terms after normalizing each term.
 * Uses word-boundary matching via containsNormalizedTerm.
 *
 * @param normalizer - Function to normalize each term before matching. Default: normalizeTextForSearch.
 */
export function containsAnyTerm(
  text: string,
  terms: readonly string[],
  normalizer: (s: string) => string = normalizeTextForSearch,
): boolean {
  for (const term of terms) {
    const normalizedTerm = normalizer(term);
    if (containsNormalizedTerm(text, normalizedTerm)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if text contains any term as a substring (simple includes).
 * Use when word-boundary matching is not needed (e.g. policy keyword detection).
 */
export function containsAnyTermAsSubstring(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}
