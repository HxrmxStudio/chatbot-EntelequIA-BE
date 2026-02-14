import { estimateCostUsd } from '@/modules/wf1/domain/llm-cost-policy';

describe('llm-cost-policy/estimateCostUsd', () => {
  it('estimates cost including reduced cached token billing', () => {
    const cost = estimateCostUsd({
      model: 'gpt-4.1-mini',
      inputTokens: 1000,
      outputTokens: 200,
      cachedTokens: 400,
    });

    expect(cost).toBeCloseTo(0.0006, 6);
  });

  it('returns zero for unsupported models', () => {
    const cost = estimateCostUsd({
      model: 'unknown-model',
      inputTokens: 1000,
      outputTokens: 100,
      cachedTokens: 50,
    });

    expect(cost).toBe(0);
  });

  it('handles null usage metrics safely', () => {
    const cost = estimateCostUsd({
      model: 'gpt-4.1-nano',
      inputTokens: null,
      outputTokens: null,
      cachedTokens: null,
    });

    expect(cost).toBe(0);
  });
});

