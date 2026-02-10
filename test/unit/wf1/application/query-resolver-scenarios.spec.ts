import { resolveProductsQuery } from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';
import { QUERY_RESOLVER_SCENARIOS } from '../../../fixtures/wf1/query-resolver-scenarios';

describe('Query Resolver Scenarios (no OpenAI)', () => {
  it('covers at least 20 scenarios deterministically', () => {
    expect(QUERY_RESOLVER_SCENARIOS.length).toBeGreaterThanOrEqual(20);
  });

  it('resolves all scenarios without throwing and returns a non-empty productName', () => {
    for (const scenario of QUERY_RESOLVER_SCENARIOS) {
      const result = resolveProductsQuery(scenario.entities, scenario.originalText);

      expect(typeof result.productName).toBe('string');
      expect(result.productName.trim().length).toBeGreaterThan(0);
    }
  });

  it('matches expected outputs where provided', () => {
    for (const scenario of QUERY_RESOLVER_SCENARIOS) {
      if (!scenario.expected) continue;

      const result = resolveProductsQuery(scenario.entities, scenario.originalText);

      if (typeof scenario.expected.productName === 'string') {
        expect(result.productName).toBe(scenario.expected.productName);
      }

      if (typeof scenario.expected.category !== 'undefined') {
        expect(result.category).toBe(scenario.expected.category);
      }

      if (typeof scenario.expected.categorySlug !== 'undefined') {
        expect(result.categorySlug).toBe(scenario.expected.categorySlug);
      }
    }
  });
});
