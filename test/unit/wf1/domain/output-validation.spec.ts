import {
  detectSentiment,
  validateAndEnrichIntentOutput,
} from '@/modules/wf1/domain/output-validation';

describe('Output Validation', () => {
  describe('detectSentiment', () => {
    it('detects negative sentiment when negative keywords win', () => {
      expect(detectSentiment('esto es pésimo y un problema')).toBe('negative');
      expect(detectSentiment('JAMÁS me respondieron, horrible')).toBe('negative');
      expect(detectSentiment('malísimo')).toBe('negative'); // substring match
    });

    it('detects positive sentiment when positive keywords win', () => {
      expect(detectSentiment('genial gracias!')).toBe('positive');
      expect(detectSentiment('Increíble, excelente servicio')).toBe('positive');
    });

    it('returns neutral for unknown or tied sentiment', () => {
      expect(detectSentiment('hola, tienen One Piece?')).toBe('neutral');
      expect(detectSentiment('genial pero pésimo')).toBe('neutral'); // tie
      expect(detectSentiment('')).toBe('neutral');
    });
  });

  describe('validateAndEnrichIntentOutput', () => {
    it('returns intent result with sentiment always present', () => {
      const enriched = validateAndEnrichIntentOutput({
        originalText: 'genial gracias',
        intentResult: {
          intent: 'products',
          confidence: 0.9,
          entities: ['manga'],
        },
      });

      expect(enriched).toEqual({
        intent: 'products',
        confidence: 0.9,
        entities: ['manga'],
        sentiment: 'positive',
      });
    });
  });
});
