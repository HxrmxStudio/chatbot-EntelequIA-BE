import {
  buildRecommendationsFranchiseDisambiguationResponse,
  buildRecommendationsUnknownFollowupResponse,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/recommendations-disambiguation-response';

describe('recommendations-disambiguation-response', () => {
  it('shows candidate count when count is available', () => {
    const response = buildRecommendationsFranchiseDisambiguationResponse({
      franchiseLabel: 'evangelion',
      totalCandidates: 20,
      suggestedTypes: ['mangas'],
    });

    expect(response.message).toContain('Encontre 20 producto(s) de evangelion.');
  });

  it('does not claim zero candidates on ambiguous follow-up', () => {
    const response = buildRecommendationsUnknownFollowupResponse({
      franchiseLabel: 'evangelion',
      state: 'awaiting_category_or_volume',
      suggestedTypes: [],
    });

    expect(response.message).toContain('Tengo opciones de evangelion.');
    expect(response.message).not.toContain('Encontre 0 producto(s)');
  });
});
