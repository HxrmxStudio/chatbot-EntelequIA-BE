import type { AuditPort } from '@/modules/wf1/application/ports/audit.port';
import type { ChatPersistencePort, PersistTurnInput } from '@/modules/wf1/application/ports/chat-persistence.port';
import type { IdempotencyPort } from '@/modules/wf1/application/ports/idempotency.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import { finalizeSuccess } from '@/modules/wf1/application/use-cases/handle-incoming-message/orchestration/finalize-success';

describe('finalizeSuccess', () => {
  it('builds metadata and runs final side effects in order (persist -> markProcessed -> audit)', async () => {
    const sideEffects: string[] = [];
    let persistedTurnInput: PersistTurnInput | undefined;
    let auditMetadata: Record<string, unknown> | undefined;

    const chatPersistence: ChatPersistencePort = {
      persistTurn: jest.fn(async (input: PersistTurnInput) => {
        sideEffects.push('persist_turn');
        persistedTurnInput = input;
        return { botMessageId: 'bot-msg-1' };
      }),
    } as unknown as ChatPersistencePort;

    const idempotencyPort: IdempotencyPort = {
      markProcessed: jest.fn(async () => {
        sideEffects.push('mark_processed');
      }),
    } as unknown as IdempotencyPort;

    const auditPort: AuditPort = {
      writeAudit: jest.fn(async (input) => {
        sideEffects.push('write_audit');
        auditMetadata = (input.metadata ?? {}) as Record<string, unknown>;
      }),
    } as unknown as AuditPort;

    const incrementMessage = jest.fn();
    const observeResponseLatency = jest.fn();
    const incrementStockExactDisclosure = jest.fn();

    const metricsPort: MetricsPort = {
      incrementMessage,
      observeResponseLatency,
      incrementStockExactDisclosure,
    } as unknown as MetricsPort;

    const result = await finalizeSuccess({
      requestId: 'req-finalize-1',
      externalEventId: 'event-finalize-1',
      payload: {
        source: 'web',
        conversationId: 'conv-finalize-1',
        userId: 'user-1',
      },
      startedAt: Date.now() - 50,
      sanitizedText: 'quiero recomendaciones',
      effectiveUserId: 'user-1',
      response: {
        ok: true,
        conversationId: 'conv-finalize-1',
        intent: 'recommendations',
        message: 'Te recomiendo estos titulos.',
      },
      routedIntent: 'recommendations',
      effectiveRoutedIntent: 'recommendations',
      validatedIntent: {
        confidence: 0.92,
        entities: ['one piece'],
        sentiment: 'neutral',
      },
      contextBlocks: [
        {
          contextType: 'recommendations',
          contextPayload: { items: [] },
        },
      ],
      exactStockDisclosed: true,
      catalogSnapshot: [
        {
          id: 'prod-1',
          title: 'One Piece 01',
          productUrl: 'https://entelequia.com.ar/producto/one-piece-01',
          thumbnailUrl: 'https://entelequia.com.ar/images/one-piece-01.jpg',
          currency: 'ARS',
          amount: 10000,
        },
      ],
      latestBotMessage: null,
      recommendationsFlowStateToPersist: 'awaiting_volume_detail',
      recommendationsFlowFranchiseToPersist: 'one_piece',
      recommendationsFlowCategoryHintToPersist: 'mangas',
      recommendationsLastFranchiseToPersist: 'one_piece',
      recommendationsLastTypeToPersist: 'mangas',
      recommendationsSnapshotTimestampToPersist: 1_700_000_000_000,
      recommendationsSnapshotSourceToPersist: 'recommendations',
      recommendationsSnapshotItemCountToPersist: 12,
      ordersEscalationFlowStateToPersist: 'awaiting_cancelled_reason_confirmation',
      llmAttempts: 1,
      toolAttempts: 1,
      pipelineFallbackCount: 0,
      pipelineFallbackReasons: [],
      intentRescuedTo: null,
      intentRescueReason: null,
      ordersDataSource: null,
      orderIdResolved: null,
      orderStateRaw: null,
      orderStateCanonical: null,
      ordersStateConflict: false,
      ordersDeterministicReply: false,
      authPresent: false,
      chatPersistence,
      idempotencyPort,
      auditPort,
      metricsPort,
      logger: {
        chat: jest.fn(),
        info: jest.fn(),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected successful finalization');
    }
    expect(result.responseId).toBe('bot-msg-1');

    expect(sideEffects).toEqual(['persist_turn', 'mark_processed', 'write_audit']);
    expect(persistedTurnInput).toBeDefined();

    const metadata = (persistedTurnInput?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.requiresAuth).toBe(false);
    expect(metadata.predictedIntent).toBe('recommendations');
    expect(metadata.recommendationsFlowState).toBe('awaiting_volume_detail');
    expect(metadata.recommendationsFlowFranchise).toBe('one_piece');
    expect(metadata.recommendationsFlowCategoryHint).toBe('mangas');
    expect(metadata.ordersEscalationFlowState).toBe('awaiting_cancelled_reason_confirmation');
    expect(metadata.catalogSnapshot).toEqual([
      {
        id: 'prod-1',
        title: 'One Piece 01',
        productUrl: 'https://entelequia.com.ar/producto/one-piece-01',
        thumbnailUrl: 'https://entelequia.com.ar/images/one-piece-01.jpg',
        currency: 'ARS',
        amount: 10000,
      },
    ]);

    expect(auditMetadata).toMatchObject({
      recommendationsFlowState: 'awaiting_volume_detail',
      recommendationsFlowFranchise: 'one_piece',
      recommendationsFlowCategoryHint: 'mangas',
      responseType: 'success',
    });

    expect(incrementMessage).toHaveBeenCalledTimes(1);
    expect(observeResponseLatency).toHaveBeenCalledTimes(1);
    expect(incrementStockExactDisclosure).toHaveBeenCalledTimes(1);
  });
});
