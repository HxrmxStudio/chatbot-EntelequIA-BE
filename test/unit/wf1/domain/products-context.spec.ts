import {
  buildProductAvailabilityHint,
  buildProductsAiContext,
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
      expect(summary).toContain('Stock: Quedan pocas unidades');
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
      expect(hint).toContain('Stock: Quedan pocas unidades');
      expect(hint).toContain('Link: https://entelequia.com.ar/producto/attack-on-titan-tomo-1');
    });

    it('shows exact stock when policy requires explicit disclosure', () => {
      const hint = buildProductAvailabilityHint(
        {
          id: 1,
          slug: 'attack-on-titan-tomo-1',
          title: 'Attack on Titan Tomo 1',
          stock: 2,
          price: { currency: 'ARS', amount: 1500 },
          url: 'https://entelequia.com.ar/producto/attack-on-titan-tomo-1',
        },
        {
          discloseExactStock: true,
          lowStockThreshold: 3,
        },
      );

      expect(hint).toContain('Stock: En stock (2).');
    });
  });

  describe('buildProductsAiContext', () => {
    it('formats a markdown-like context with counts', () => {
      const result = buildProductsAiContext({
        query: 'Attack on Titan',
        total: 2,
        items: [
          {
            id: 1,
            slug: 'attack-on-titan-edicion-deluxe-01',
            title: 'ATTACK ON TITAN EDICIÓN DELUXE 01',
            stock: 6,
            categoryName: 'Seinen',
            price: { currency: 'ARS', amount: 24999 },
            url: 'https://entelequia.com.ar/producto/attack-on-titan-edicion-deluxe-01',
          },
        ],
      });

      expect(result.productCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.inStockCount).toBe(1);
      expect(result.contextText).toContain('PRODUCTOS ENTELEQUIA');
      expect(result.contextText).toContain('ATTACK ON TITAN EDICIÓN DELUXE 01');
      expect(result.contextText).toContain('Mostrando 1 de 2');
      expect(result.contextText).toContain('Stock: Hay stock');
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

    it('matches zero-padded volume titles like "DELUXE 01"', () => {
      const items = [
        {
          id: 1,
          slug: 'attack-on-titan-edicion-deluxe-04',
          title: 'ATTACK ON TITAN EDICIÓN DELUXE 04',
          stock: 8,
        },
        {
          id: 2,
          slug: 'attack-on-titan-edicion-deluxe-01',
          title: 'ATTACK ON TITAN EDICIÓN DELUXE 01',
          stock: 6,
        },
        {
          id: 3,
          slug: 'attack-on-titan-edicion-deluxe-02',
          title: 'ATTACK ON TITAN EDICIÓN DELUXE 02',
          stock: 18,
        },
      ];

      const match = selectBestProductMatch({
        items,
        entities: ['manga', 'Attack on Titan', 'Nro 1'],
        text: 'Hola, tienen manga Nro 1 de Attack on Titan?',
      });

      expect(match?.slug).toBe('attack-on-titan-edicion-deluxe-01');
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
