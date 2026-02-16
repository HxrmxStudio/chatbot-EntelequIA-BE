import { resolveRecommendationsPreferences } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolveRecommendationsPreferences', () => {
  it('detects specific recommendation type from text/entities', () => {
    const result = resolveRecommendationsPreferences({
      text: 'Recomendame cartas de Magic',
      entities: ['Magic'],
    });

    expect(result.type).toContain('juego_tcg_magic');
  });

  it('detects genres in rioplatense spanish', () => {
    const result = resolveRecommendationsPreferences({
      text: 'Quiero algo de accion y fantasia',
      entities: [],
    });

    expect(result.genre).toEqual(expect.arrayContaining(['accion', 'fantasia']));
  });

  it('detects age from explicit age phrases', () => {
    const result = resolveRecommendationsPreferences({
      text: 'Busco un regalo para 12 anos',
      entities: [],
    });

    expect(result.age).toBe(12);
  });

  it('returns empty preferences for ambiguous text', () => {
    const result = resolveRecommendationsPreferences({
      text: 'No se que elegir',
      entities: [],
    });

    expect(result).toEqual({
      franchiseKeywords: [],
      genre: [],
      type: [],
      age: null,
      prefersLowPrice: false,
    });
  });

  it('detects price preference from "necesito algo barato"', () => {
    const result = resolveRecommendationsPreferences({
      text: 'necesito algo barato',
      entities: [],
    });

    expect(result.prefersLowPrice).toBe(true);
  });

  it('detects price preference from "opciones economicas"', () => {
    const result = resolveRecommendationsPreferences({
      text: 'tenes opciones economicas de manga?',
      entities: [],
    });

    expect(result.prefersLowPrice).toBe(true);
  });

  it('falls back to legacy detector when specific detector has no direct match', () => {
    const result = resolveRecommendationsPreferences({
      text: 'Busco playmobil de Naruto',
      entities: [],
    });

    expect(result.franchiseKeywords).toContain('naruto');
    expect(result.type).toContain('merch_figuras');
  });
});
