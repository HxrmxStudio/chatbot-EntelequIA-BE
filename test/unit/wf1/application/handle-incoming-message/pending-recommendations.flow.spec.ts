import { handlePendingRecommendationsFlow } from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/recommendations/pending-recommendations.flow';

describe('handlePendingRecommendationsFlow', () => {
  it('keeps state untouched when there are no follow-up signals', () => {
    const result = handlePendingRecommendationsFlow({
      currentFlow: {
        state: 'awaiting_category_or_volume',
        franchise: 'one_piece',
        categoryHint: null,
      },
      text: 'chau',
      entities: [],
    });

    expect(result.response).toBeUndefined();
    expect(result.rewrittenText).toBe('chau');
    expect(result.entitiesOverride).toEqual([]);
    expect(result.nextState).toBe('awaiting_category_or_volume');
    expect(result.nextFranchise).toBe('one_piece');
    expect(result.nextCategoryHint).toBeNull();
    expect(result.resolved).toBe(false);
  });

  it('keeps disambiguation open to request a volume when type is mangas/comics', () => {
    const result = handlePendingRecommendationsFlow({
      currentFlow: {
        state: 'awaiting_category_or_volume',
        franchise: 'one_piece',
        categoryHint: null,
      },
      text: 'manga',
      entities: [],
    });

    expect(result.response).toBeDefined();
    expect(result.response?.ok).toBe(false);
    expect(result.response?.message).toContain('decime una opcion');
    expect(result.nextState).toBe('awaiting_volume_detail');
    expect(result.nextFranchise).toBe('one_piece');
    expect(result.nextCategoryHint).toBe('mangas');
    expect(result.resolved).toBe(false);
  });

  it('rewrites to direct recommendation query when a volume is provided', () => {
    const result = handlePendingRecommendationsFlow({
      currentFlow: {
        state: 'awaiting_category_or_volume',
        franchise: 'one_piece',
        categoryHint: 'mangas',
      },
      text: 'tomo 3',
      entities: [],
    });

    expect(result.response).toBeUndefined();
    expect(result.rewrittenText).toContain('recomendame mangas de one piece tomo 3');
    expect(result.entitiesOverride).toEqual(['one_piece']);
    expect(result.nextState).toBeNull();
    expect(result.nextFranchise).toBeNull();
    expect(result.nextCategoryHint).toBeNull();
    expect(result.resolved).toBe(true);
  });

  it('resolves awaiting-volume flow when user asks for from-the-start recommendations', () => {
    const result = handlePendingRecommendationsFlow({
      currentFlow: {
        state: 'awaiting_volume_detail',
        franchise: 'one_piece',
        categoryHint: 'mangas',
      },
      text: 'desde el inicio',
      entities: [],
    });

    expect(result.response).toBeUndefined();
    expect(result.rewrittenText).toContain('recomendame mangas de one piece desde el inicio');
    expect(result.entitiesOverride).toEqual(['one_piece']);
    expect(result.nextState).toBeNull();
    expect(result.nextFranchise).toBeNull();
    expect(result.nextCategoryHint).toBeNull();
    expect(result.resolved).toBe(true);
  });

  it('keeps awaiting-volume state when follow-up remains ambiguous', () => {
    const result = handlePendingRecommendationsFlow({
      currentFlow: {
        state: 'awaiting_volume_detail',
        franchise: 'one_piece',
        categoryHint: 'mangas',
      },
      text: 'manga',
      entities: [],
    });

    expect(result.response).toBeDefined();
    expect(result.response?.ok).toBe(false);
    expect(result.nextState).toBe('awaiting_volume_detail');
    expect(result.nextFranchise).toBe('one_piece');
    expect(result.nextCategoryHint).toBe('mangas');
    expect(result.resolved).toBe(false);
  });
});
