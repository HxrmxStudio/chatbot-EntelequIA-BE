import type { ConversationHistoryRow } from '@/modules/wf1/domain/conversation-history';
import {
  isSnapshotFresh,
  resolveRecommendationContinuation,
  resolveRecommendationsMemoryFromHistory,
  resolveRecommendationsMemoryUpdateFromContext,
} from '@/modules/wf1/application/use-cases/handle-incoming-message/flows/recommendations/recommendations-memory';

describe('recommendations-memory', () => {
  it('resolves memory snapshot from bot metadata and prompted message', () => {
    const ts = Date.now();
    const history: ConversationHistoryRow[] = [
      {
        id: '2',
        sender: 'bot',
        content: 'Perfecto, te muestro productos de k pop para ese presupuesto.',
        type: 'text',
        channel: 'web',
        created_at: new Date().toISOString(),
        metadata: {
          recommendationsLastFranchise: 'k_pop',
          recommendationsLastType: 'mangas',
          recommendationsPromptedFranchise: 'k_pop', // Now using metadata instead of parsing message
          recommendationsSnapshotTimestamp: ts,
          recommendationsSnapshotSource: 'recommendations',
          recommendationsSnapshotItemCount: 5,
        },
      },
    ];

    const memory = resolveRecommendationsMemoryFromHistory(history);
    expect(memory.lastFranchise).toBe('k_pop');
    expect(memory.lastType).toBe('mangas');
    expect(memory.promptedFranchise).toBe('k_pop');
    expect(memory.snapshotTimestamp).toBe(ts);
    expect(memory.snapshotSource).toBe('recommendations');
    expect(memory.snapshotItemCount).toBe(5);
  });

  it('reuses previous franchise on short follow-up acknowledgement', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'dale',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'k_pop',
        lastType: 'mangas',
        promptedFranchise: 'k_pop',
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
    expect(resolution.rewrittenText.toLowerCase()).toContain('productos de k pop');
    expect(resolution.entitiesOverride).toContain('k pop');
  });

  it('forces recommendations when user explicitly names a franchise after general routing', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'ahh ok, si de yugioh',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: null,
        lastType: null,
        promptedFranchise: null,
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
    expect(resolution.rewrittenText).toBe('ahh ok, si de yugioh');
  });

  it('reuses previous franchise on Argentine short ack "seh"', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'seh',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'evangelion',
        lastType: 'mangas',
        promptedFranchise: 'evangelion',
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
    expect(resolution.rewrittenText.toLowerCase()).toContain('productos de evangelion');
  });

  it('reuses previous franchise on short ack "oka"', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'oka',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'naruto',
        lastType: 'mangas',
        promptedFranchise: 'naruto',
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
    expect(resolution.rewrittenText.toLowerCase()).toContain('productos de naruto');
  });

  it('reuses previous franchise on short ack "barbaro"', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'barbaro',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'one_piece',
        lastType: 'mangas',
        promptedFranchise: 'one_piece',
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
    expect(resolution.rewrittenText.toLowerCase()).toContain('productos de one piece');
  });

  it('forces recommendations when text contains catalog signal like chainsaw man', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'tenes algo de chainsaw man?',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: null,
        lastType: null,
        promptedFranchise: null,
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
  });

  it('forces recommendations when text contains catalog signal like one piece', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'busco one piece',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: null,
        lastType: null,
        promptedFranchise: null,
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
  });

  it('updates persisted memory from recommendations context matches', () => {
    const update = resolveRecommendationsMemoryUpdateFromContext({
      contextBlocks: [
        {
          contextType: 'recommendations',
          contextPayload: {
            products: [{ id: '1', title: 'Yu Gi Oh tomo 1' }],
            matchedFranchises: ['yugioh'],
            preferences: { type: ['mangas'] },
          },
        },
      ],
      text: 'tenes de yugioh?',
      entities: [],
    });

    expect(update.lastFranchise).toBe('yugioh');
    expect(update.lastType).toBe('mangas');
    expect(typeof update.snapshotTimestamp).toBe('number');
    expect(update.snapshotSource).toBe('recommendations');
    expect(update.snapshotItemCount).toBe(1);
  });

  it('does not rewrite short ack when snapshot is stale and promptedFranchise is null', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'dale',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'evangelion',
        lastType: 'mangas',
        promptedFranchise: null,
        snapshotTimestamp: Date.now() - 10 * 60 * 1000,
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
    expect(resolution.rewrittenText).toBe('dale');
  });

  it('does not treat "necesito algo barato" as continuation when prompted franchise is unknown', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'necesito algo barato',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'naruto',
        lastType: 'mangas',
        promptedFranchise: null,
        snapshotTimestamp: Date.now() - 10 * 60 * 1000,
      },
    });

    expect(resolution.rewrittenText).toBe('necesito algo barato');
    expect(resolution.entitiesOverride).toEqual([]);
    expect(resolution.forceRecommendationsIntent).toBe(false);
  });

  it('does not force recommendations for "necesito algo barato" as first request', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'necesito algo barato',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: null,
        lastType: null,
        promptedFranchise: null,
      },
    });

    expect(resolution.rewrittenText).toBe('necesito algo barato');
    expect(resolution.entitiesOverride).toEqual([]);
    expect(resolution.forceRecommendationsIntent).toBe(false);
  });

  it('treats "mas barato" as continuation when comparing with previous catalog', () => {
    const resolution = resolveRecommendationContinuation({
      text: 'cual es el mas barato de los que mostraste?',
      entities: [],
      routedIntent: 'general',
      memory: {
        lastFranchise: 'naruto',
        lastType: 'mangas',
        promptedFranchise: 'naruto',
        snapshotTimestamp: Date.now() - 1000,
      },
    });

    expect(resolution.forceRecommendationsIntent).toBe(true);
  });

  it('isSnapshotFresh returns false when timestamp is null', () => {
    expect(isSnapshotFresh({ snapshotTimestamp: null })).toBe(false);
  });

  it('isSnapshotFresh returns true when within maxAge', () => {
    expect(isSnapshotFresh({ snapshotTimestamp: Date.now() - 1000 }, 5000)).toBe(true);
  });

  it('isSnapshotFresh returns false when beyond maxAge', () => {
    expect(isSnapshotFresh({ snapshotTimestamp: Date.now() - 10000 }, 5000)).toBe(false);
  });
});
