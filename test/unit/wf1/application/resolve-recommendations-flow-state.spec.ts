import {
  resolveRecommendationFollowup,
  resolveRecommendationFlowStateFromHistory,
  shouldContinueRecommendationsFlow,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/resolve-recommendations-flow-state';

describe('resolve-recommendations-flow-state', () => {
  it('resolves latest recommendations flow state from bot metadata', () => {
    const state = resolveRecommendationFlowStateFromHistory([
      {
        id: '1',
        content: 'mensaje',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: {
          recommendationsFlowState: 'awaiting_volume_detail',
          recommendationsFlowFranchise: 'one_piece',
          recommendationsFlowCategoryHint: 'mangas',
        },
        created_at: '2026-02-12T10:00:01.000Z',
      },
      {
        id: '2',
        content: 'anterior',
        sender: 'bot',
        type: 'text',
        channel: 'web',
        metadata: {
          recommendationsFlowState: 'awaiting_category_or_volume',
          recommendationsFlowFranchise: 'naruto',
        },
        created_at: '2026-02-12T09:59:59.000Z',
      },
    ]);

    expect(state).toEqual({
      state: 'awaiting_volume_detail',
      franchise: 'one_piece',
      categoryHint: 'mangas',
    });
  });

  it('parses follow-up category and franchise signals', () => {
    const followup = resolveRecommendationFollowup({
      text: 'mangas de envangelion',
      entities: [],
    });

    expect(followup.hasSignals).toBe(true);
    expect(followup.requestedType).toBe('mangas');
    expect(followup.mentionedFranchise).toBe('evangelion');
  });

  it('parses volume detail signals', () => {
    const followup = resolveRecommendationFollowup({
      text: 'quiero el tomo 3',
      entities: [],
    });

    expect(followup.hasSignals).toBe(true);
    expect(followup.volumeNumber).toBe(3);
    expect(followup.wantsLatest).toBe(false);
    expect(followup.wantsStart).toBe(false);
  });

  it('continues flow only when pending state has recommendation signals', () => {
    expect(
      shouldContinueRecommendationsFlow({
        currentFlowState: 'awaiting_category_or_volume',
        text: 'figuras',
        entities: [],
      }),
    ).toBe(true);

    expect(
      shouldContinueRecommendationsFlow({
        currentFlowState: 'awaiting_category_or_volume',
        text: 'gracias',
        entities: [],
      }),
    ).toBe(false);
  });
});
