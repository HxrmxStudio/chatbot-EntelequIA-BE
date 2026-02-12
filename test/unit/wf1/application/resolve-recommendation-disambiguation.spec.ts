import {
  resolveRecommendationDisambiguation,
  resolveRecommendationVolumeSignals,
} from '@/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers';

describe('resolve-recommendation-disambiguation', () => {
  it('asks for category disambiguation when franchise has many candidates and no type', () => {
    const result = resolveRecommendationDisambiguation({
      text: 'quiero one piece',
      franchise: 'one_piece',
      suggestedTypes: ['mangas', 'merch_figuras'],
      totalCandidates: 50,
      preferredTypes: [],
      franchiseThreshold: 20,
      volumeThreshold: 10,
    });

    expect(result.needsDisambiguation).toBe(true);
    expect(result.reason).toBe('franchise_scope');
  });

  it('asks for volume clarification for manga/comic when many candidates and no tomo signal', () => {
    const result = resolveRecommendationDisambiguation({
      text: 'busco mangas de one piece',
      franchise: 'one_piece',
      suggestedTypes: ['mangas'],
      totalCandidates: 24,
      preferredTypes: ['mangas'],
      franchiseThreshold: 20,
      volumeThreshold: 10,
    });

    expect(result.needsDisambiguation).toBe(true);
    expect(result.reason).toBe('volume_scope');
  });

  it('does not disambiguate when user already provided volume signal', () => {
    const result = resolveRecommendationDisambiguation({
      text: 'manga one piece tomo 3',
      franchise: 'one_piece',
      suggestedTypes: ['mangas'],
      totalCandidates: 24,
      preferredTypes: ['mangas'],
      franchiseThreshold: 20,
      volumeThreshold: 10,
    });

    expect(result.needsDisambiguation).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('parses volume signals from follow-up text', () => {
    const signals = resolveRecommendationVolumeSignals('mostrame el tomo 12 o los ultimos');

    expect(signals.hasVolumeSignal).toBe(true);
    expect(signals.volumeNumber).toBe(12);
    expect(signals.wantsLatest).toBe(true);
  });
});
