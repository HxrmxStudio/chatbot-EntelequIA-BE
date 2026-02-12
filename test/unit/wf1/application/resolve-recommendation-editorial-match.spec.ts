import { resolveRecommendationEditorialMatch } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolveRecommendationEditorialMatch', () => {
  const brands = [
    { id: 1, name: 'Ivrea Argentina', slug: 'ivrea-argentina' },
    { id: 2, name: 'Panini Argentina', slug: 'panini-argentina' },
    { id: 3, name: 'Ovni Press', slug: 'ovni-press' },
  ];

  const authors = [
    { id: 10, name: 'Masashi Kishimoto', slug: 'masashi-kishimoto' },
    { id: 11, name: 'Hajime Isayama', slug: 'hajime-isayama' },
  ];

  it('matches editorials with exact token and typo tolerance', () => {
    const exact = resolveRecommendationEditorialMatch({
      text: 'Tenes mangas de ivrea?',
      entities: [],
      brands,
      authors,
    });
    const typo = resolveRecommendationEditorialMatch({
      text: 'Tenes mangas de panin?',
      entities: [],
      brands,
      authors,
    });

    expect(exact.matchedBrands).toContain('Ivrea Argentina');
    expect(typo.matchedBrands).toContain('Panini Argentina');
    expect(typo.confidence).toBeGreaterThan(0.3);
  });

  it('returns ranked suggestions when there is no exact match', () => {
    const result = resolveRecommendationEditorialMatch({
      text: 'algo de manga argentino',
      entities: [],
      brands,
      authors,
    });

    expect(result.suggestedBrands.length).toBeGreaterThan(0);
    expect(result.suggestedBrands[0]).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.2);
  });
});
