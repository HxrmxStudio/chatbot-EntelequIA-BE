import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADAPTIVE_EXEMPLARS_PORT,
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
  METRICS_PORT,
  ORDER_LOOKUP_PORT,
  ORDER_LOOKUP_RATE_LIMITER_PORT,
  PROMPT_TEMPLATES_PORT,
} from '../../ports/tokens';
import type { AuditPort } from '../../ports/audit.port';
import type { AdaptiveExemplarsPort } from '../../ports/adaptive-exemplars.port';
import type { ChatPersistencePort } from '../../ports/chat-persistence.port';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import type { IdempotencyPort } from '../../ports/idempotency.port';
import type { IntentExtractorPort } from '../../ports/intent-extractor.port';
import type { LlmPort } from '../../ports/llm.port';
import type { MetricsPort } from '../../ports/metrics.port';
import type { OrderLookupRateLimiterPort } from '../../ports/order-lookup-rate-limiter.port';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import type { ChatRequestDto } from '../../../dto/chat-request.dto';
import type { Wf1Response } from '../../../domain/wf1-response';
import { WF1_MAX_TEXT_CHARS } from '../../../domain/text-policy';
import { WF1_MAX_CONVERSATION_HISTORY_MESSAGES } from '../../../domain/conversation-history';
import { sanitizeText, sanitizeTextPreservingLineBreaks } from '../../../domain/text-sanitizer';
import { resolveBooleanFlag } from '../../../../../common/utils/config.utils';
import { createLogger } from '../../../../../common/utils/logger';
import { EnrichContextByIntentUseCase } from '../enrich-context-by-intent';
import type { OrderLookupPort } from '../../ports/order-lookup.port';
import { finalizeFailure } from './orchestration/finalize-failure';
import { finalizeSuccess } from './orchestration/finalize-success';
import { handleDuplicateEvent } from './orchestration/handle-duplicate-event';
import { prepareRequestContext } from './orchestration/prepare-request-context';
import { resolveResponse } from './orchestration/resolve-response';
import { checkIfAuthenticated } from './support/check-if-authenticated';
import { resolveLatestBotMessageFromHistory } from './support/handle-incoming-message.helpers';

@Injectable()
export class HandleIncomingMessageUseCase {
  private readonly logger = createLogger(HandleIncomingMessageUseCase.name);
  private readonly historyLimit: number;
  private readonly recursiveLearningEnabled: boolean;

  constructor(
    @Inject(INTENT_EXTRACTOR_PORT)
    private readonly intentExtractor: IntentExtractorPort,
    @Inject(LLM_PORT)
    private readonly llmPort: LlmPort,
    @Inject(CHAT_PERSISTENCE_PORT)
    private readonly chatPersistence: ChatPersistencePort,
    @Inject(IDEMPOTENCY_PORT)
    private readonly idempotencyPort: IdempotencyPort,
    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
    @Inject(ENTELEQUIA_CONTEXT_PORT)
    private readonly entelequiaContextPort: EntelequiaContextPort,
    private readonly enrichContextByIntent: EnrichContextByIntentUseCase,
    @Inject(ORDER_LOOKUP_PORT)
    private readonly orderLookupClient: OrderLookupPort,
    @Inject(PROMPT_TEMPLATES_PORT)
    private readonly promptTemplates: PromptTemplatesPort,
    @Inject(METRICS_PORT)
    private readonly metricsPort: MetricsPort,
    @Inject(ORDER_LOOKUP_RATE_LIMITER_PORT)
    private readonly orderLookupRateLimiter: OrderLookupRateLimiterPort,
    @Inject(ADAPTIVE_EXEMPLARS_PORT)
    private readonly adaptiveExemplars: AdaptiveExemplarsPort,
    private readonly configService: ConfigService,
  ) {
    const configuredLimit =
      this.configService.get<number>('CHAT_HISTORY_LIMIT') ?? WF1_MAX_CONVERSATION_HISTORY_MESSAGES;
    this.historyLimit = Math.min(
      Math.max(0, configuredLimit),
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
    );
    this.recursiveLearningEnabled = resolveBooleanFlag(
      this.configService.get<string | boolean>('WF1_RECURSIVE_LEARNING_ENABLED'),
      true,
    );
  }

  async execute(input: {
    requestId: string;
    externalEventId: string;
    payload: ChatRequestDto;
    idempotencyPayload: Record<string, unknown>;
    clientIp?: string;
  }): Promise<Wf1Response> {
    const startedAt = Date.now();

    if (typeof input.payload.text !== 'string') {
      throw new BadRequestException('Payload invalido.');
    }

    const sanitizedText = sanitizeText(input.payload.text);
    const lookupSafeText = sanitizeTextPreservingLineBreaks(input.payload.text);
    if (sanitizedText.length === 0 || sanitizedText.length > WF1_MAX_TEXT_CHARS) {
      throw new BadRequestException('Payload invalido.');
    }

    const duplicateResponse = await handleDuplicateEvent({
      requestId: input.requestId,
      externalEventId: input.externalEventId,
      payload: input.payload,
      idempotencyPayload: input.idempotencyPayload,
      startedAt,
      idempotencyPort: this.idempotencyPort,
      chatPersistence: this.chatPersistence,
      auditPort: this.auditPort,
      metricsPort: this.metricsPort,
    });

    if (duplicateResponse) {
      return duplicateResponse;
    }

    try {
      const requestContext = await prepareRequestContext({
        requestId: input.requestId,
        payload: input.payload,
        sanitizedText,
        idempotencyPayload: input.idempotencyPayload,
        historyLimit: this.historyLimit,
        chatPersistence: this.chatPersistence,
        entelequiaContextPort: this.entelequiaContextPort,
        intentExtractor: this.intentExtractor,
        logger: this.logger,
      });
      const latestBotMessage = resolveLatestBotMessageFromHistory(requestContext.historyRows);

      const resolvedResponse = await resolveResponse({
        requestId: input.requestId,
        externalEventId: input.externalEventId,
        payload: {
          source: input.payload.source,
          conversationId: input.payload.conversationId,
          accessToken: input.payload.accessToken,
          currency: input.payload.currency,
        },
        clientIp: input.clientIp,
        sanitizedText,
        lookupSafeText,
        validatedIntent: requestContext.validatedIntent,
        routedIntent: requestContext.routedIntent,
        routedIntentResult: requestContext.routedIntentResult,
        effectiveUserId: requestContext.effectiveUserId,
        historyRows: requestContext.historyRows,
        history: requestContext.history,
        latestBotMessage,
        recursiveLearningEnabled: this.recursiveLearningEnabled,
        enrichContextByIntent: this.enrichContextByIntent,
        llmPort: this.llmPort,
        promptTemplates: this.promptTemplates,
        metricsPort: this.metricsPort,
        adaptiveExemplars: this.adaptiveExemplars,
        guestOrderDependencies: {
          orderLookupRateLimiter: this.orderLookupRateLimiter,
          orderLookupClient: this.orderLookupClient,
          metricsPort: this.metricsPort,
          logger: this.logger,
        },
        logger: this.logger,
      });

      return await finalizeSuccess({
        requestId: input.requestId,
        externalEventId: input.externalEventId,
        payload: {
          source: input.payload.source,
          conversationId: input.payload.conversationId,
          userId: input.payload.userId,
        },
        startedAt,
        sanitizedText,
        effectiveUserId: requestContext.effectiveUserId,
        response: resolvedResponse.response,
        routedIntent: requestContext.routedIntent,
        effectiveRoutedIntent: resolvedResponse.effectiveRoutedIntent,
        validatedIntent: {
          confidence: requestContext.validatedIntent.confidence,
          entities: requestContext.validatedIntent.entities,
          sentiment: requestContext.validatedIntent.sentiment,
        },
        contextBlocks: resolvedResponse.contextBlocks,
        llmMetadata: resolvedResponse.llmMetadata,
        exactStockDisclosed: resolvedResponse.exactStockDisclosed,
        uiPayload: resolvedResponse.uiPayload,
        catalogSnapshot: resolvedResponse.catalogSnapshot,
        latestBotMessage,
        guestOrderFlowStateToPersist: resolvedResponse.guestOrderFlowStateToPersist,
        recommendationsFlowStateToPersist: resolvedResponse.recommendationsFlowStateToPersist,
        recommendationsFlowFranchiseToPersist:
          resolvedResponse.recommendationsFlowFranchiseToPersist,
        recommendationsFlowCategoryHintToPersist:
          resolvedResponse.recommendationsFlowCategoryHintToPersist,
        recommendationsLastFranchiseToPersist:
          resolvedResponse.recommendationsLastFranchiseToPersist,
        recommendationsLastTypeToPersist: resolvedResponse.recommendationsLastTypeToPersist,
        recommendationsSnapshotTimestampToPersist:
          resolvedResponse.recommendationsSnapshotTimestampToPersist,
        recommendationsSnapshotSourceToPersist:
          resolvedResponse.recommendationsSnapshotSourceToPersist,
        recommendationsSnapshotItemCountToPersist:
          resolvedResponse.recommendationsSnapshotItemCountToPersist,
        ordersEscalationFlowStateToPersist: resolvedResponse.ordersEscalationFlowStateToPersist,
        llmAttempts: resolvedResponse.llmAttempts,
        toolAttempts: resolvedResponse.toolAttempts,
        pipelineFallbackCount: resolvedResponse.pipelineFallbackCount,
        pipelineFallbackReasons: resolvedResponse.pipelineFallbackReasons,
        intentRescuedTo: resolvedResponse.intentRescuedTo,
        intentRescueReason: resolvedResponse.intentRescueReason,
        ordersDataSource: resolvedResponse.ordersDataSource ?? null,
        orderIdResolved: resolvedResponse.orderIdResolved ?? null,
        orderStateRaw: resolvedResponse.orderStateRaw ?? null,
        orderStateCanonical: resolvedResponse.orderStateCanonical ?? null,
        ordersStateConflict: resolvedResponse.ordersStateConflict,
        ordersDeterministicReply: resolvedResponse.ordersDeterministicReply,
        ordersGuestLookupAttempted: resolvedResponse.ordersGuestLookupAttempted,
        ordersGuestLookupResultCode: resolvedResponse.ordersGuestLookupResultCode,
        ordersGuestLookupStatusCode: resolvedResponse.ordersGuestLookupStatusCode,
        authPresent: checkIfAuthenticated(input.payload.accessToken),
        chatPersistence: this.chatPersistence,
        idempotencyPort: this.idempotencyPort,
        auditPort: this.auditPort,
        metricsPort: this.metricsPort,
        logger: this.logger,
      });
    } catch (error: unknown) {
      return finalizeFailure({
        error,
        requestId: input.requestId,
        externalEventId: input.externalEventId,
        payload: input.payload,
        startedAt,
        logger: this.logger,
        idempotencyPort: this.idempotencyPort,
        auditPort: this.auditPort,
        metricsPort: this.metricsPort,
      });
    }
  }
}
