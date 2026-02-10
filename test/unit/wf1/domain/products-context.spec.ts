import {
  buildProductAvailabilityHint,
  buildProductsSummary,
  selectBestProductMatch,
} from '@/modules/wf1/domain/products-context';

describe('Products Context', () => {
  describe('buildProductsSummary', () => {
    it('returns safe message when there are no items', () => {
      expect(buildProductsSummary([])).toContain('No encontre productos');
    });

    it('formats items with stock', () => {
      const summary = buildProductsSummary([
        {
          id: 1,
          slug: 'attack-on-titan-tomo-1',
          title: 'Attack on Titan Tomo 1',
          stock: 3,
          price: { currency: 'ARS', amount: 1000 },
        },
      ]);

      expect(summary).toContain('Productos disponibles:');
      expect(summary).toContain('Attack on Titan Tomo 1');
      expect(summary).toContain('Stock: 3');
    });
  });

  describe('buildProductAvailabilityHint', () => {
    it('includes stock and url when product is in stock', () => {
      const hint = buildProductAvailabilityHint({
        id: 1,
        slug: 'attack-on-titan-tomo-1',
        title: 'Attack on Titan Tomo 1',
        stock: 2,
        price: { currency: 'ARS', amount: 1500 },
        url: 'https://entelequia.com.ar/producto/attack-on-titan-tomo-1',
      });

      expect(hint).toContain('tenemos stock');
      expect(hint).toContain('Stock: 2');
      expect(hint).toContain('Link: https://entelequia.com.ar/producto/attack-on-titan-tomo-1');
    });
  });

  describe('selectBestProductMatch', () => {
    it('prefers volume + series match and picks highest stock among matches', () => {
      const items = [
        {
          id: 1,
          slug: 'attack-on-titan-tomo-1',
          title: 'Attack on Titan Tomo 1',
          stock: 0,
        },
        {
          id: 2,
          slug: 'attack-on-titan-tomo-1-especial',
          title: 'Attack on Titan Tomo 1 Edicion especial',
          stock: 5,
        },
        {
          id: 3,
          slug: 'attack-on-titan-tomo-2',
          title: 'Attack on Titan Tomo 2',
          stock: 10,
        },
      ];

      const match = selectBestProductMatch({
        items,
        entities: ['Attack on Titan', 'manga Nro 1'],
        text: 'Hola, tienen manga Nro 1 de Attack on Titan?',
      });

      expect(match?.slug).toBe('attack-on-titan-tomo-1-especial');
    });

    it('returns undefined when it cannot extract series tokens', () => {
      const match = selectBestProductMatch({
        items: [
          { id: 1, slug: 'x', title: 'Algo Tomo 1', stock: 2 },
          { id: 2, slug: 'y', title: 'Otro', stock: 1 },
        ],
        entities: [],
        text: 'tomo 1',
      });

      expect(match).toBeUndefined();
    });
  });
});

