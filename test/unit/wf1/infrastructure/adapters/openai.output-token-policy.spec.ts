import { resolveMaxOutputTokens } from '@/modules/wf1/infrastructure/adapters/openai/constants';

describe('openai/output-token-policy', () => {
  it('returns intent-specific token limits', () => {
    expect(resolveMaxOutputTokens('general')).toBe(90);
    expect(resolveMaxOutputTokens('recommendations')).toBe(200);
    expect(resolveMaxOutputTokens('orders')).toBe(130);
  });
});

