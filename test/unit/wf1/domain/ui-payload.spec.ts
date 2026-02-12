import { buildCatalogUiPayload } from '@/modules/wf1/domain/ui-payload';
import type { ContextBlock } from '@/modules/wf1/domain/context-block';

describe('ui payload builder', () => {
  it('builds catalog cards from products context with thumbnails in every card', () => {
    const blocks: ContextBlock[] = [
      {
        contextType: 'products',
        contextPayload: {
          items: [
            {
              id: 'p1',
              title: 'Evangelion Figure',
              categoryName: 'Figuras',
              stock: 1,
              url: 'https://entelequia.com.ar/producto/p1',
              imageUrl: 'https://entelequia.com.ar/images/p1.jpg',
              price: { amount: 100, currency: 'ARS' },
            },
            {
              id: 'p2',
              title: 'Evangelion Manga',
              categoryName: 'Mangas',
              stock: 10,
              url: 'https://entelequia.com.ar/producto/p2',
              imageUrl: 'http://entelequia.com.ar/images/p2.jpg',
              priceWithDiscount: { amount: 50, currency: 'ARS' },
              discountPercent: 20,
            },
            {
              id: 'p3',
              title: 'Evangelion Poster',
              stock: 0,
              url: 'https://entelequia.com.ar/producto/p3',
            },
            {
              id: 'p4',
              title: 'Evangelion Artbook',
              stock: 5,
              url: 'https://entelequia.com.ar/producto/p4',
            },
            {
              id: 'p5',
              title: 'Evangelion Book',
              stock: 5,
              url: 'https://entelequia.com.ar/producto/p5',
            },
          ],
        },
      },
    ];

    const ui = buildCatalogUiPayload(blocks);

    expect(ui).toBeDefined();
    expect(ui?.version).toBe('1');
    expect(ui?.cards).toHaveLength(5);
    expect(ui?.cards[0]).toMatchObject({
      id: 'p1',
      title: 'Evangelion Figure',
      subtitle: 'Figuras',
      priceLabel: '$100 ARS',
      availabilityLabel: 'quedan pocas unidades',
      thumbnailUrl: 'https://entelequia.com.ar/images/p1.jpg',
    });
    expect(ui?.cards[1]).toMatchObject({
      thumbnailUrl: 'https://entelequia.com.ar/images/p2.jpg',
    });
    expect(ui?.cards.every((card) => typeof card.thumbnailUrl === 'string')).toBe(true);
    expect(
      ui?.cards
        .filter((card) => card.id === 'p3' || card.id === 'p4' || card.id === 'p5')
        .every((card) => card.thumbnailUrl === 'https://entelequia.com.ar/favicon.ico'),
    ).toBe(true);
    expect(ui?.cards[1].badges).toEqual(['-20%']);
    expect(ui?.cards[2].availabilityLabel).toBe('sin stock');
    expect(ui?.cards[3].availabilityLabel).toBe('hay stock');
  });

  it('builds cards from recommendations when products block is not present', () => {
    const blocks: ContextBlock[] = [
      {
        contextType: 'recommendations',
        contextPayload: {
          products: [
            {
              id: 'r1',
              title: 'Recomendado',
              categoryNames: ['Mangas'],
              stock: '3',
              url: 'https://entelequia.com.ar/producto/r1',
              imageUrl: 'https://entelequia.com.ar/images/r1.jpg',
              price: { amount: 1234, currency: 'ARS' },
            },
          ],
        },
      },
    ];

    const ui = buildCatalogUiPayload(blocks);

    expect(ui).toBeDefined();
    expect(ui?.cards).toHaveLength(1);
    expect(ui?.cards[0]).toMatchObject({
      id: 'r1',
      title: 'Recomendado',
      subtitle: 'Mangas',
      availabilityLabel: 'quedan pocas unidades',
      thumbnailUrl: 'https://entelequia.com.ar/images/r1.jpg',
    });
  });

  it('returns undefined when no valid cards can be built', () => {
    const blocks: ContextBlock[] = [
      {
        contextType: 'products',
        contextPayload: {
          items: [{ title: 'Sin URL' }],
        },
      },
    ];

    const ui = buildCatalogUiPayload(blocks);

    expect(ui).toBeUndefined();
  });
});
