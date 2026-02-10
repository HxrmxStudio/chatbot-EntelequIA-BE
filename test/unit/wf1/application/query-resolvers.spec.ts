import {
  detectProductCategory,
  resolveOrderId,
  resolveProductsQuery,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('Query Resolvers', () => {
  describe('resolveProductsQuery', () => {
    it('returns productName and metadata flags', () => {
      const result = resolveProductsQuery(['One Piece', 'rústica'], 'Dame One Piece en rústica');
      expect(result.productName).toBe('One Piece');
      expect(result.hasFormatHint).toBe(true);
      expect(result.category).toBeNull();
      expect(result.categorySlug).toBeUndefined();
    });

    it('detects category based on original text', () => {
      const result = resolveProductsQuery(['Magic', 'cartas'], 'Dame cartas de Magic');
      expect(result.productName).toBe('Magic');
      expect(result.category).toBe('juego_tcg');
      expect(result.categorySlug).toBe('juegos-de-cartas-coleccionables-magic');
    });

    it('falls back to originalText when entities are generic or empty', () => {
      const result = resolveProductsQuery(['juegos'], 'Tienen juegos?');
      expect(result.productName).toBe('Tienen juegos?');
    });

    it('filters generic tokens and keeps specific subject', () => {
      const result = resolveProductsQuery(['Merchandising', 'Pokemon'], 'Merchandising de Pokemon');
      expect(result.productName).toBe('Pokemon');
    });

    it('strips format/language modifiers from product name', () => {
      const result = resolveProductsQuery(
        ['3', 'mangas', 'rústica', 'One Piece'],
        '3 mangas en rústica de One Piece',
      );
      expect(result.productName).toBe('One Piece');
    });

    it('falls back to originalText when no entities', () => {
      const result = resolveProductsQuery([], 'Hola, tienen Attack on Titan?');
      expect(result.productName).toContain('Attack on Titan');
    });
  });

  describe('detectProductCategory', () => {
    it('detects tcg category', () => {
      expect(detectProductCategory('Dame cartas de Magic')).toBe('juego_tcg');
    });

    it('detects merch figures category', () => {
      expect(detectProductCategory('Figuras de One Piece')).toBe('merch_figuras');
    });

    it('detects tarot category', () => {
      expect(detectProductCategory('Tarot Rider')).toBe('tarot');
    });

    it('detects manga category', () => {
      expect(detectProductCategory('Manga One Piece tomo 1')).toBe('manga');
    });

    it('detects comic category', () => {
      expect(detectProductCategory('Comic Transformers grapa')).toBe('comic');
    });

    it('detects merch clothing category', () => {
      expect(detectProductCategory('Busco una remera de Naruto')).toBe('merch_ropa');
    });

    it('detects board games category', () => {
      expect(detectProductCategory('Tienen juegos de mesa?')).toBe('juego_mesa');
    });

    it('detects rpg category', () => {
      expect(detectProductCategory('Busco un juego de rol D&D')).toBe('juego_rol');
    });

    it('detects books category', () => {
      expect(detectProductCategory('Tenes un libro de One Piece?')).toBe('libro');
    });

    it('returns null when no category is detected', () => {
      expect(detectProductCategory('Dragon Ball')).toBeNull();
    });
  });

  describe('resolveOrderId', () => {
    it('extracts order id from natural language', () => {
      expect(resolveOrderId([], 'pedido 123456')).toBe('123456');
      expect(resolveOrderId([], 'orden #654321')).toBe('654321');
    });

    it('extracts order id from entities when it is a pure number', () => {
      expect(resolveOrderId(['123456'], '')).toBe('123456');
    });

    it('returns undefined when there is no order id', () => {
      expect(resolveOrderId([], 'un producto')).toBeUndefined();
    });

    it('does not match short numbers (avoid false positives)', () => {
      expect(resolveOrderId([], 'pedido 12345')).toBeUndefined();
    });
  });
});
