import {
  buildDynamicFranchiseAliases,
  getRecommendationFranchiseTerms,
  resolveRecommendationFranchiseQuery,
  resolveRecommendationFranchiseKeywords,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('recommendation franchise keywords', () => {
  it('detects evangelion even with common typo', () => {
    const result = resolveRecommendationFranchiseKeywords({
      text: 'quiero un regalo de envangelion',
      entities: [],
    });

    expect(result).toContain('evangelion');
  });

  it('detects naruto based on text and entities', () => {
    const result = resolveRecommendationFranchiseKeywords({
      text: 'algo de anime',
      entities: ['naruto'],
    });

    expect(result).toEqual(['naruto']);
  });

  it('resolves canonical query by franchise key', () => {
    expect(resolveRecommendationFranchiseQuery('one_piece')).toBe('one piece');
  });

  it('returns normalized terms per franchise', () => {
    const terms = getRecommendationFranchiseTerms('evangelion');
    expect(terms).toEqual(expect.arrayContaining(['evangelion', 'envangelion', 'eva']));
  });

  it('builds dynamic aliases from repeated item titles and detects unknown franchises', () => {
    const dynamicAliases = buildDynamicFranchiseAliases({
      items: [
        {
          id: 1,
          slug: 'wotakoi-tomo-1',
          title: 'Wotakoi tomo 1',
          stock: 2,
          categoryNames: ['Mangas'],
          categorySlugs: ['mangas'],
        },
        {
          id: 2,
          slug: 'wotakoi-tomo-2',
          title: 'Wotakoi tomo 2',
          stock: 3,
          categoryNames: ['Mangas'],
          categorySlugs: ['mangas'],
        },
      ],
    });

    const result = resolveRecommendationFranchiseKeywords({
      text: 'tenes algo de wotakoi?',
      entities: [],
      dynamicAliases,
    });

    expect(result).toContain('wotakoi');
  });
});
