import type { ProductSearchItem } from './types';

export function selectBestProductMatch(input: {
  items: ProductSearchItem[];
  entities: string[];
  text: string;
}): ProductSearchItem | undefined {
  if (input.items.length === 0) {
    return undefined;
  }

  const volume = extractVolumeNumber(input.text, input.entities);
  const seriesTokens = extractSeriesTokens(input.entities, input.text);
  if (seriesTokens.length === 0) {
    return undefined;
  }

  const withTitle = input.items.map((item) => ({
    item,
    title: normalizeForMatch(item.title),
  }));

  const volumeTokens = volume ? buildVolumeTokens(volume) : [];

  const exact = withTitle.filter(({ title }) => {
    const matchesSeries = seriesTokens.every((t) => title.includes(t));
    if (!matchesSeries) return false;
    if (volumeTokens.length === 0) return true;
    return volumeTokens.some((vt) => title.includes(vt));
  });

  if (exact.length > 0) {
    return pickPreferredByStock(exact.map((x) => x.item));
  }

  const seriesOnly = withTitle.filter(({ title }) => seriesTokens.every((t) => title.includes(t)));
  if (seriesOnly.length > 0) {
    return pickPreferredByStock(seriesOnly.map((x) => x.item));
  }

  return undefined;
}

function pickPreferredByStock(items: ProductSearchItem[]): ProductSearchItem {
  const inStock = items.filter((item) => item.stock > 0);
  if (inStock.length > 0) {
    return inStock.reduce((best, current) => (current.stock > best.stock ? current : best));
  }

  return items[0];
}

function extractVolumeNumber(text: string, entities: string[]): number | undefined {
  const sources = [text, ...entities].filter((v) => typeof v === 'string');

  for (const source of sources) {
    const normalized = normalizeForMatch(source);

    const match = normalized.match(
      /(?:tomo|vol(?:umen)?|nro|n|no|numero|#)\s*0*(\d{1,3})\b/i,
    );
    if (match?.[1]) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
  }

  return undefined;
}

function extractSeriesTokens(entities: string[], fallbackText: string): string[] {
  const entityCandidates = entities
    .map((entity) => stripVolumeHints(normalizeForMatch(entity)))
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);

  const candidates =
    entityCandidates.length > 0
      ? entityCandidates
      : [stripVolumeHints(normalizeForMatch(fallbackText)).trim()].filter((c) => c.length > 0);

  if (candidates.length === 0) {
    return [];
  }

  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a));

  const stopWords = new Set([
    'de',
    'del',
    'la',
    'el',
    'los',
    'las',
    'the',
    'and',
    'y',
    'on',
    'of',
    'a',
    'an',
  ]);

  return best
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopWords.has(token));
}

function buildVolumeTokens(volume: number): string[] {
  const v = String(volume);
  return [
    `#${v}`,
    `vol ${v}`,
    `vol.${v}`,
    `volumen ${v}`,
    `tomo ${v}`,
    `nro ${v}`,
    `numero ${v}`,
    `no ${v}`,
  ];
}

function stripVolumeHints(value: string): string {
  return value.replace(
    /(?:tomo|vol(?:umen)?|nro|n|no|numero|#)\s*0*\d{1,3}\b/gi,
    '',
  );
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
