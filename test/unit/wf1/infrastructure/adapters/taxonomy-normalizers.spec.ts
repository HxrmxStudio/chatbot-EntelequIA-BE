import {
  normalizeAuthorsPayload,
  normalizeBrandsPayload,
} from '@/modules/wf1/infrastructure/adapters/entelequia-http/taxonomy-normalizers';

describe('taxonomy-normalizers', () => {
  it('normalizes and deduplicates brands safely', () => {
    const result = normalizeBrandsPayload({
      brands: [
        { id: 1, name: 'Ivrea Argentina', slug: 'ivrea-argentina' },
        { id: '1b', name: 'Ivrea Argentina', slug: 'ivrea-argentina' },
        { id: 2, name: 'Panini Argentina', slug: 'panini-argentina' },
        { id: 3, name: ' ', slug: 'invalid' },
      ],
    });

    expect(result.brands).toEqual([
      { id: 1, name: 'Ivrea Argentina', slug: 'ivrea-argentina' },
      { id: 2, name: 'Panini Argentina', slug: 'panini-argentina' },
    ]);
  });

  it('returns empty arrays for invalid payload shapes', () => {
    const brands = normalizeBrandsPayload({ brands: 'invalid' as unknown as [] });
    const authors = normalizeAuthorsPayload({ authors: null as unknown as [] });

    expect(brands.brands).toEqual([]);
    expect(authors.authors).toEqual([]);
  });
});
