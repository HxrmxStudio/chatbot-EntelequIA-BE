import { getDefaultCategorySlug } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('getDefaultCategorySlug', () => {
  it('maps granular recommendation types to canonical tree slugs', () => {
    expect(getDefaultCategorySlug('juego_tcg_magic')).toBe(
      'juegos-de-cartas-coleccionables-magic',
    );
    expect(getDefaultCategorySlug('merch_ropa_buzos')).toBe('buzos');
    expect(getDefaultCategorySlug('juego_lego')).toBe('lego');
    expect(getDefaultCategorySlug('tarot_y_magia')).toBe('tarot-y-magia');
  });

  it('supports legacy aliases and normalizes to canonical slug', () => {
    expect(getDefaultCategorySlug('juego_tcg')).toBe(
      'juegos-juegos-de-cartas-coleccionables',
    );
    expect(getDefaultCategorySlug('tarot')).toBe('tarot-y-magia');
    expect(getDefaultCategorySlug('merch_ropa')).toBe('merchandising-ropa');
  });

  it('returns null for unknown recommendation types', () => {
    expect(getDefaultCategorySlug('desconocido')).toBeNull();
  });
});
