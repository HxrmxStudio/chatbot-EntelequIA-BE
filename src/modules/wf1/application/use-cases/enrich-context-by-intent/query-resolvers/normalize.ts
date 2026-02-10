/**
 * Normalizes text for token matching: trim, NFD, strip diacritics, lowercase, collapse spaces.
 */
export function normalizeForToken(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s{2,}/g, ' ');
}
