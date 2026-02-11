import { normalizeForToken } from './normalize';

const EXPLICIT_STOCK_PATTERNS: RegExp[] = [
  /\bcuant[ao]s?\s+(?:hay|quedan|tienen)\b/i,
  /\bcuantas?\s+unidades\b/i,
  /\bstock\s+exacto\b/i,
  /\bcantidad\s+exacta\b/i,
  /\bdecime\s+cuantas?\b/i,
  /\bnumero\s+de\s+unidades\b/i,
];

export function resolveStockDisclosure(input: {
  text: string;
  entities: string[];
}): boolean {
  const candidates = [input.text, ...input.entities];

  for (const candidate of candidates) {
    const normalized = normalizeForToken(candidate);
    if (normalized.length === 0) {
      continue;
    }

    if (EXPLICIT_STOCK_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return true;
    }
  }

  return false;
}

