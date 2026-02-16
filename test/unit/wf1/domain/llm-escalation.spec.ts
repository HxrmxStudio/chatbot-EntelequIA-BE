import {
  shouldEscalateToPrimary,
  type LlmEscalationSignals,
} from '@/modules/wf1/domain/model-router';

describe('shouldEscalateToPrimary', () => {
  it('returns false when signals is null', () => {
    expect(shouldEscalateToPrimary(null, 'orders')).toBe(false);
    expect(shouldEscalateToPrimary(null, 'general')).toBe(false);
  });

  it('returns true when confidence is low regardless of intent', () => {
    const signals: LlmEscalationSignals = {
      confidenceLabel: 'low',
      requiresClarification: false,
    };
    expect(shouldEscalateToPrimary(signals, 'general')).toBe(true);
    expect(shouldEscalateToPrimary(signals, 'orders')).toBe(true);
  });

  it('returns true when requires clarification and intent is not general', () => {
    const signals: LlmEscalationSignals = {
      confidenceLabel: 'high',
      requiresClarification: true,
    };
    expect(shouldEscalateToPrimary(signals, 'orders')).toBe(true);
    expect(shouldEscalateToPrimary(signals, 'recommendations')).toBe(true);
  });

  it('returns false when requires clarification but intent is general', () => {
    const signals: LlmEscalationSignals = {
      confidenceLabel: 'high',
      requiresClarification: true,
    };
    expect(shouldEscalateToPrimary(signals, 'general')).toBe(false);
  });

  it('returns false when high confidence and no clarification needed', () => {
    const signals: LlmEscalationSignals = {
      confidenceLabel: 'high',
      requiresClarification: false,
    };
    expect(shouldEscalateToPrimary(signals, 'orders')).toBe(false);
    expect(shouldEscalateToPrimary(signals, 'general')).toBe(false);
  });

  it('returns false for medium confidence without clarification', () => {
    const signals: LlmEscalationSignals = {
      confidenceLabel: 'medium',
      requiresClarification: false,
    };
    expect(shouldEscalateToPrimary(signals, 'orders')).toBe(false);
  });
});
