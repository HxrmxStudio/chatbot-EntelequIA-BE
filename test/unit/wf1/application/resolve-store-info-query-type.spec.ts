import { resolveStoreInfoQueryType } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolveStoreInfoQueryType', () => {
  it('detects location queries', () => {
    const result = resolveStoreInfoQueryType({
      text: 'donde queda el local de belgrano?',
      entities: [],
    });

    expect(result).toBe('location');
  });

  it('detects hours queries', () => {
    const result = resolveStoreInfoQueryType({
      text: 'a que hora abren el sabado?',
      entities: [],
    });

    expect(result).toBe('hours');
  });

  it('detects parking queries', () => {
    const result = resolveStoreInfoQueryType({
      text: 'hay estacionamiento para auto?',
      entities: [],
    });

    expect(result).toBe('parking');
  });

  it('detects transport queries with higher priority than location', () => {
    const result = resolveStoreInfoQueryType({
      text: 'como llego al local en subte?',
      entities: [],
    });

    expect(result).toBe('transport');
  });

  it('falls back to general when no store subtype is detected', () => {
    const result = resolveStoreInfoQueryType({
      text: 'contame de entelequia',
      entities: [],
    });

    expect(result).toBe('general');
  });
});
