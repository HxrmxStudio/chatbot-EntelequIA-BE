/**
 * Generic text utilities for term normalization and matching.
 * Used by recommendation filtering and franchise matching.
 */

export function normalizeTerm(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s{2,}/g, ' ');
}

export function containsTerm(normalizedValue: string, normalizedTerm: string): boolean {
  if (normalizedTerm.length === 0) {
    return false;
  }

  if (normalizedValue.includes(normalizedTerm)) {
    return true;
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(normalizedValue);
}
