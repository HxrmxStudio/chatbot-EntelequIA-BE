import {
  extractRecommendedItems,
  extractRecommendationsTotal,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/recommendation-parsers';

describe('RecommendationParsers', () => {
  it('extracts recommended items from payload.data and normalizes stock', () => {
    const items = extractRecommendedItems(
      {
        data: [
          {
            id: 10,
            slug: 'one-piece-1',
            title: 'One Piece 1',
            stock: '3',
            price: { currency: 'ARS', amount: 12000 },
            categories: [{ name: 'Mangas', slug: 'mangas' }],
          },
        ],
      },
      'https://entelequia.com.ar',
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 10,
      slug: 'one-piece-1',
      title: 'One Piece 1',
      stock: 3,
      categoryName: 'Mangas',
      categorySlug: 'mangas',
      categoryNames: ['Mangas'],
      categorySlugs: ['mangas'],
      url: 'https://entelequia.com.ar/producto/one-piece-1',
    });
  });

  it('extracts recommendations total from pagination when available', () => {
    const total = extractRecommendationsTotal(
      {
        data: [],
        pagination: { total: 27 },
      },
      0,
    );

    expect(total).toBe(27);
  });

  it('falls back to length when pagination total is missing', () => {
    const total = extractRecommendationsTotal(
      {
        data: [{ id: 1 }, { id: 2 }],
      },
      2,
    );

    expect(total).toBe(2);
  });
});

