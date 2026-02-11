import { resolveStockDisclosure } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolveStockDisclosure', () => {
  it('returns false for a general product query', () => {
    expect(
      resolveStockDisclosure({
        text: 'Hola, tienen Attack on Titan deluxe 1?',
        entities: ['Attack on Titan'],
      }),
    ).toBe(false);
  });

  it('returns true when user asks explicitly for quantity', () => {
    expect(
      resolveStockDisclosure({
        text: 'Cuantas unidades tienen de Attack on Titan?',
        entities: ['Attack on Titan'],
      }),
    ).toBe(true);
  });

  it('detects quantity request from entities too', () => {
    expect(
      resolveStockDisclosure({
        text: 'Necesito saber el stock',
        entities: ['cantidad exacta'],
      }),
    ).toBe(true);
  });
});

