import { isRecord } from '@/common/utils/object.utils';

const MAX_BRANDS = 60;
const MAX_AUTHORS = 40;

interface TaxonomyEntry {
  id: string | number;
  name: string;
  slug: string;
}

export function normalizeBrandsPayload(body: Record<string, unknown>): {
  brands: TaxonomyEntry[];
} {
  return {
    brands: normalizeTaxonomyEntries(body.brands, MAX_BRANDS),
  };
}

export function normalizeAuthorsPayload(body: Record<string, unknown>): {
  authors: TaxonomyEntry[];
} {
  return {
    authors: normalizeTaxonomyEntries(body.authors, MAX_AUTHORS),
  };
}

function normalizeTaxonomyEntries(raw: unknown, maxItems: number): TaxonomyEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const entries: TaxonomyEntry[] = [];

  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }

    const name = toCleanString(item.name);
    if (!name) {
      continue;
    }

    const slug = toCleanString(item.slug) ?? normalizeSlug(name);
    if (slug.length === 0) {
      continue;
    }

    const id = toId(item.id, slug);
    const dedupeKey = `${slug}|${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    entries.push({
      id,
      name,
      slug,
    });

    if (entries.length >= maxItems) {
      break;
    }
  }

  return entries;
}

function toCleanString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toId(value: unknown, fallback: string): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function normalizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
