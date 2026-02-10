import {
  IntentValidationError,
  validateAndNormalizeIntentPayload,
} from '@/modules/wf1/infrastructure/adapters/intent-validator';

describe('validateAndNormalizeIntentPayload', () => {
  it('rejects additional properties', () => {
    expect(() =>
      validateAndNormalizeIntentPayload({
        intent: 'products',
        confidence: 0.9,
        entities: [],
        foo: 'bar',
      }),
    ).toThrow(IntentValidationError);
  });

  it('dedupes and trims entities', () => {
    const result = validateAndNormalizeIntentPayload({
      intent: 'products',
      confidence: 0.8,
      entities: [' One Piece ', 'One Piece', 'tomo 33', ''],
    });

    expect(result.entities).toEqual(['One Piece', 'tomo 33']);
  });

  it('clamps confidence to [0,1]', () => {
    const high = validateAndNormalizeIntentPayload({
      intent: 'general',
      confidence: 1.4,
      entities: [],
    });
    const low = validateAndNormalizeIntentPayload({
      intent: 'general',
      confidence: -0.2,
      entities: [],
    });

    expect(high.confidence).toBe(1);
    expect(low.confidence).toBe(0);
  });
});
