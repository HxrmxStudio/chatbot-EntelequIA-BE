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
  ORDER_LOOKUP_RATE_LIMITER_PORT,
  PROMPT_TEMPLATES_PORT,
} from '../../ports/tokens';
import type { AuditPort } from '../../ports/audit.port';
import type { AdaptiveExemplarsPort } from '../../ports/adaptive-exemplars.port';
import type { ChatPersistencePort } from '../../ports/chat-persistence.port';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import type { IdempotencyPort } from '../../ports/idempotency.port';
import type { IntentExtractorPort } from '../../ports/intent-extractor.port';
import type { LlmPort, LlmReplyMetadata } from '../../ports/llm.port';
import type { MetricsPort } from '../../ports/metrics.port';
import type { OrderLookupRateLimiterPort } from '../../ports/order-lookup-rate-limiter.port';
import type { PromptTemplatesPort } from '../../ports/prompt-templates.port';
import type { ChatRequestDto } from '../../../dto/chat-request.dto';
import { ExternalServiceError } from '../../../domain/errors';
import type { UserContext } from '../../../domain/user';
import type { Wf1Response } from '../../../domain/wf1-response';
import { getResponseAuditStatus } from '../../../domain/wf1-response';
import { prepareConversationQuery } from '../../../domain/prepare-conversation-query';
import { WF1_MAX_TEXT_CHARS } from '../../../domain/text-policy';
import {
  WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
  mapConversationHistoryRowsToMessageHistoryItems,
} from '../../../domain/conversation-history';
import type { ConversationHistoryRow } from '../../../domain/conversation-history';
import { appendStaticContextBlock, type ContextBlock } from '../../../domain/context-block';
import { sanitizeAssistantUserMessage } from '../../../domain/assistant-output-safety';
import { sanitizeText } from '../../../domain/text-sanitizer';
import { validateAndEnrichIntentOutput } from '../../../domain/output-validation';
import { resolveIntentRoute } from '../../../domain/intent-routing';
import type { CatalogSnapshotItem, UiPayloadV1 } from '../../../domain/ui-payload';
import { buildCatalogSnapshot, buildCatalogUiPayload } from '../../../domain/ui-payload';
import type { IntentName } from '../../../domain/intent';
import { createLogger } from '../../../../../common/utils/logger';
import { EnrichContextByIntentUseCase } from '../enrich-context-by-intent';
import { EntelequiaOrderLookupClient } from '../../../infrastructure/adapters/entelequia-http';
import {
  BACKEND_ERROR_MESSAGE,
  mapContextOrBackendError,
} from './error-mapper';
import { checkIfAuthenticated } from './check-if-authenticated';
import {
  buildOrderLookupHasDataQuestionResponse,
  buildOrderLookupInvalidPayloadResponse,
  buildOrderLookupMissingIdentityFactorsResponse,
  buildOrderLookupMissingOrderIdResponse,
  buildOrderLookupProvideDataResponse,
  buildOrderLookupSuccessMessage,
  buildOrderLookupThrottledResponse,
  buildOrderLookupUnauthorizedResponse,
  buildOrderLookupUnknownHasDataAnswerResponse,
  buildOrderLookupVerificationFailedResponse,
} from './orders-order-lookup-response';
import {
  buildCancelledOrderEscalationActionResponse,
  buildCancelledOrderEscalationDeclinedResponse,
  buildCancelledOrderEscalationUnknownAnswerResponse,
} from './orders-escalation-response';
import {
  buildRecommendationsFranchiseDisambiguationResponse,
  buildRecommendationsUnknownFollowupResponse,
  buildRecommendationsVolumeDisambiguationResponse,
  formatRecommendationCategoryLabel,
} from './recommendations-disambiguation-response';
import {
  buildCheapestPriceMessage,
  buildMostExpensivePriceMessage,
  buildPriceComparisonMissingSnapshotMessage,
} from './price-comparison-response';
import { resolveOrderLookupRequest } from './resolve-order-lookup-request';
import { buildOrdersRequiresAuthResponse } from './orders-unauthenticated-response';
import {
  hasOrderLookupSignals,
  isShortIsolatedOrderAck,
  type GuestOrderFlowState,
  resolveOrderDataAnswerStrength,
  resolveGuestOrderFlowStateFromHistory,
  resolveHasOrderDataAnswer,
  shouldContinueGuestOrderLookupFlow,
} from './resolve-order-lookup-flow-state';
import {
  ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY,
  type OrdersEscalationFlowState,
  resolveCancelledOrderEscalationAnswer,
  resolveOrdersEscalationFlowStateFromHistory,
  resolveRecentCancelledOrderId,
  shouldContinueOrdersEscalationFlow,
  shouldSuggestCancelledOrderEscalation,
} from './resolve-orders-escalation-flow-state';
import {
  type RecommendationDisambiguationState,
  type RecommendationFlowStateSnapshot,
  RECOMMENDATIONS_FLOW_CATEGORY_HINT_METADATA_KEY,
  RECOMMENDATIONS_FLOW_FRANCHISE_METADATA_KEY,
  RECOMMENDATIONS_FLOW_STATE_METADATA_KEY,
  resolveRecommendationFollowup,
  resolveRecommendationFlowStateFromHistory,
  shouldContinueRecommendationsFlow,
} from './resolve-recommendations-flow-state';
import {
  resolveLatestCatalogSnapshotFromHistory,
  resolvePriceComparisonItem,
  resolvePriceComparisonRequestIntent,
} from './resolve-price-comparison-followup';

const STORE_INFO_POLICY_VERSION = 'v2-exact-weekly-hours';

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
    private readonly orderLookupClient: EntelequiaOrderLookupClient,
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
      this.configService.get<number>('CHAT_HISTORY_LIMIT') ??
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES;
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

    if (sanitizedText.length === 0 || sanitizedText.length > WF1_MAX_TEXT_CHARS) {
      throw new BadRequestException('Payload invalido.');
    }

    const idempotency = await this.idempotencyPort.startProcessing({
      source: input.payload.source,
      externalEventId: input.externalEventId,
      payload: input.idempotencyPayload,
      requestId: input.requestId,
    });

    if (idempotency.isDuplicate) {
      const previous = await this.chatPersistence.getLastBotTurnByExternalEvent({
        channel: input.payload.source,
        externalEventId: input.externalEventId,
      });

      if (isCatalogUiMetadata(previous?.metadata)) {
        this.metricsPort.incrementUiPayloadSuppressed('duplicate');
      }

      const duplicateResponse: Wf1Response = {
        ok: true,
        message: previous?.message ?? 'Este mensaje ya fue procesado.',
        conversationId: input.payload.conversationId,
        ...(previous ? { responseId: previous.messageId } : {}),
      };

      await this.auditPort.writeAudit({
        requestId: input.requestId,
        userId: input.payload.userId,
        conversationId: input.payload.conversationId,
        source: input.payload.source,
        intent: 'duplicate',
        status: 'duplicate',
        message: duplicateResponse.message,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        metadata: {
          externalEventId: input.externalEventId,
        },
      });

      return duplicateResponse;
    }

    try {
      const user = await this.resolveUserContext(input.payload);
      const effectiveUserId = user.id;
      const conversationContext = prepareConversationQuery(input.idempotencyPayload, user);

      await this.chatPersistence.upsertConversation({
        conversationId: input.payload.conversationId,
        userId: effectiveUserId,
        channel: input.payload.source,
      });

      const historyRows = await this.chatPersistence.getConversationHistoryRows({
        conversationId:
          typeof conversationContext.conversationId === 'string'
            ? conversationContext.conversationId
            : input.payload.conversationId,
        limit: this.historyLimit,
      });
      const history = mapConversationHistoryRowsToMessageHistoryItems(historyRows);

      const intentResult = await this.intentExtractor.extractIntent({
        text: sanitizedText,
        requestId: input.requestId,
        source: input.payload.source,
        userId: effectiveUserId,
        conversationId: input.payload.conversationId,
      });

      const validatedIntent = validateAndEnrichIntentOutput({
        originalText: sanitizedText,
        intentResult,
      });
      const routedIntent = resolveIntentRoute(validatedIntent.intent);
      const routedIntentResult = { ...validatedIntent, intent: routedIntent };
      const enrichedData = { ...conversationContext, ...validatedIntent };

      this.logger.chat(`sentiment_${validatedIntent.sentiment}_detected`, {
        event: `sentiment_${validatedIntent.sentiment}_detected`,
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        user_id: effectiveUserId,
        intent: routedIntent,
        confidence: validatedIntent.confidence,
        sentiment: validatedIntent.sentiment,
      });

      this.logger.chat('intent_routed', {
        event: 'intent_routed',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        user_id: effectiveUserId,
        intent_raw: validatedIntent.intent,
        intent_route: routedIntent,
      });

      this.logger.chat('output_validation_complete', {
        event: 'output_validation_complete',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        user_id: effectiveUserId,
        intent: routedIntent,
        confidence: validatedIntent.confidence,
        entities_count: validatedIntent.entities.length,
        sentiment: validatedIntent.sentiment,
        enriched_data_keys: Object.keys(enrichedData),
      });

      this.logger.info('final_stage_started', {
        event: 'final_stage_started',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        intent: routedIntent,
        source: input.payload.source,
      });

      let contextBlocks;
      let response: Wf1Response | undefined;
      let llmMetadata: LlmReplyMetadata | undefined;
      let exactStockDisclosed = false;
      let uiPayload: UiPayloadV1 | undefined;
      let catalogSnapshot: CatalogSnapshotItem[] = [];
      let guestOrderFlowStateToPersist: GuestOrderFlowState | undefined;
      let recommendationsFlowStateToPersist:
        | RecommendationDisambiguationState
        | undefined;
      let recommendationsFlowFranchiseToPersist: string | null | undefined;
      let recommendationsFlowCategoryHintToPersist: string | null | undefined;
      let ordersEscalationFlowStateToPersist: OrdersEscalationFlowState | undefined;
      let effectiveText = sanitizedText;
      let effectiveRoutedIntent = routedIntent;
      let effectiveRoutedIntentResult = routedIntentResult;

      const isGuestOrderFlow =
        !checkIfAuthenticated(input.payload.accessToken);
      const currentGuestOrderFlowState = resolveGuestOrderFlowStateFromHistory(historyRows);
      const currentRecommendationsFlowState =
        resolveRecommendationFlowStateFromHistory(historyRows);
      const currentOrdersEscalationFlowState =
        resolveOrdersEscalationFlowStateFromHistory(historyRows);
      const guestOrderLookupSignals = resolveOrderLookupRequest({
        text: sanitizedText,
        entities: validatedIntent.entities,
      });
      const hasStrongGuestOrderLookupSignals =
        Boolean(guestOrderLookupSignals.orderId) &&
        (guestOrderLookupSignals.providedFactors > 0 ||
          guestOrderLookupSignals.invalidFactors.length > 0);
      const shouldContinueGuestOrderFlow =
        isGuestOrderFlow &&
        shouldContinueGuestOrderLookupFlow({
          currentFlowState: currentGuestOrderFlowState,
          text: sanitizedText,
          entities: validatedIntent.entities,
          routedIntent,
        });
      const shouldHandleGuestOrderFlow =
        isGuestOrderFlow &&
        (routedIntent === 'orders' ||
          shouldContinueGuestOrderFlow ||
          hasStrongGuestOrderLookupSignals);
      const shouldHandleRecommendationsPendingFlow =
        !shouldHandleGuestOrderFlow &&
        shouldContinueRecommendationsFlow({
          currentFlowState: currentRecommendationsFlowState.state,
          text: sanitizedText,
          entities: validatedIntent.entities,
        });
      const shouldHandleOrdersEscalationFlow =
        !shouldHandleGuestOrderFlow &&
        !shouldHandleRecommendationsPendingFlow &&
        shouldContinueOrdersEscalationFlow({
          currentFlowState: currentOrdersEscalationFlowState,
          text: sanitizedText,
          routedIntent,
        });

      if (isGuestOrderFlow && currentGuestOrderFlowState !== null) {
        const answerStrength = resolveOrderDataAnswerStrength(sanitizedText);
        if (
          answerStrength === 'weak_yes' &&
          !isShortIsolatedOrderAck(sanitizedText)
        ) {
          this.metricsPort.incrementOrderFlowAmbiguousAck();
        }

        if (!shouldHandleGuestOrderFlow && routedIntent !== 'orders') {
          this.metricsPort.incrementOrderFlowHijackPrevented();
        }
      }

      if (shouldHandleGuestOrderFlow) {
        const guestOrderFlow = await this.handleGuestOrderLookup({
          requestId: input.requestId,
          conversationId: input.payload.conversationId,
          userId: effectiveUserId,
          clientIp: input.clientIp,
          text: sanitizedText,
          entities: validatedIntent.entities,
          currentFlowState: currentGuestOrderFlowState,
        });
        response = guestOrderFlow.response;
        guestOrderFlowStateToPersist = guestOrderFlow.nextFlowState;
      } else if (shouldHandleOrdersEscalationFlow) {
        const pendingEscalationFlow = this.handlePendingOrdersEscalationFlow({
          text: sanitizedText,
          historyRows,
        });
        response = pendingEscalationFlow.response;
        ordersEscalationFlowStateToPersist = pendingEscalationFlow.nextFlowState;
      } else {
        if (
          isGuestOrderFlow &&
          currentGuestOrderFlowState !== null &&
          routedIntent !== 'orders'
        ) {
          guestOrderFlowStateToPersist = null;
        }

        if (currentOrdersEscalationFlowState !== null) {
          ordersEscalationFlowStateToPersist = null;
        }

        if (shouldHandleRecommendationsPendingFlow) {
          const recommendationFlow = this.handlePendingRecommendationsFlow({
            currentFlow: currentRecommendationsFlowState,
            text: sanitizedText,
            entities: validatedIntent.entities,
          });

          if (recommendationFlow.response) {
            response = recommendationFlow.response;
          } else {
            effectiveText = recommendationFlow.rewrittenText;
            effectiveRoutedIntent = 'recommendations';
            effectiveRoutedIntentResult = {
              ...routedIntentResult,
              intent: 'recommendations',
              entities: recommendationFlow.entitiesOverride,
            };
          }

          recommendationsFlowStateToPersist = recommendationFlow.nextState;
          recommendationsFlowFranchiseToPersist = recommendationFlow.nextFranchise;
          recommendationsFlowCategoryHintToPersist = recommendationFlow.nextCategoryHint;

          if (recommendationFlow.resolved) {
            this.metricsPort.incrementRecommendationsDisambiguationResolved();
          }
        }

        if (!response) {
          const priceComparisonIntent = resolvePriceComparisonRequestIntent(
            sanitizedText,
          );
          if (priceComparisonIntent !== 'none') {
            const snapshot = resolveLatestCatalogSnapshotFromHistory(historyRows);
            if (snapshot.length === 0) {
              response = {
                ok: true,
                conversationId: input.payload.conversationId,
                intent: 'products',
                message: buildPriceComparisonMissingSnapshotMessage(),
              };
            } else {
              catalogSnapshot = snapshot;
              const selected = resolvePriceComparisonItem({
                intent: priceComparisonIntent,
                items: snapshot,
              });

              if (selected) {
                response = {
                  ok: true,
                  conversationId: input.payload.conversationId,
                  intent: 'products',
                  message:
                    priceComparisonIntent === 'cheapest'
                      ? buildCheapestPriceMessage({
                          item: selected,
                          comparedCount: snapshot.length,
                        })
                      : buildMostExpensivePriceMessage({
                          item: selected,
                          comparedCount: snapshot.length,
                        }),
                };
              } else {
                response = {
                  ok: true,
                  conversationId: input.payload.conversationId,
                  intent: 'products',
                  message: buildPriceComparisonMissingSnapshotMessage(),
                };
              }
            }
          }
        }

        if (!response) {
          try {
            contextBlocks = await this.enrichContextByIntent.execute({
              intentResult: effectiveRoutedIntentResult,
              text: effectiveText,
              sentiment: validatedIntent.sentiment,
              currency: input.payload.currency,
              accessToken: input.payload.accessToken,
            });
            const disambiguationResponse =
              this.buildRecommendationsDisambiguationResponseFromContext({
                contextBlocks,
                conversationId: input.payload.conversationId,
              });

            if (disambiguationResponse) {
              response = disambiguationResponse.response;
              recommendationsFlowStateToPersist = disambiguationResponse.nextState;
              recommendationsFlowFranchiseToPersist = disambiguationResponse.nextFranchise;
              recommendationsFlowCategoryHintToPersist =
                disambiguationResponse.nextCategoryHint;
              this.metricsPort.incrementRecommendationsDisambiguationTriggered();
            } else {
              this.recordRecommendationsObservability({
                requestId: input.requestId,
                conversationId: input.payload.conversationId,
                intent: effectiveRoutedIntent,
                contextBlocks,
              });

              contextBlocks = appendStaticContextBlock(
                contextBlocks,
                this.promptTemplates.getStaticContext(),
              );

              contextBlocks = await this.appendAdaptiveExemplarContext({
                contextBlocks,
                intent: effectiveRoutedIntent as IntentName,
              });

              const llmReply = await this.llmPort.buildAssistantReply({
                requestId: input.requestId,
                conversationId: input.payload.conversationId,
                externalEventId: input.externalEventId,
                userText: effectiveText,
                intent: effectiveRoutedIntent,
                history,
                contextBlocks,
              });

              const { message, metadata } = normalizeLlmReply(llmReply);
              llmMetadata = metadata;
              exactStockDisclosed = resolveExactStockDisclosure(contextBlocks);
              uiPayload = buildCatalogUiPayload(contextBlocks);
              catalogSnapshot = buildCatalogSnapshot(contextBlocks);
              const hasCatalogContext = hasCatalogUiContext(contextBlocks);
              if (uiPayload) {
                this.metricsPort.incrementUiPayloadEmitted();
              } else if (hasCatalogContext) {
                this.metricsPort.incrementUiPayloadSuppressed('no_cards');
              }

              response = {
                ok: true,
                message,
                conversationId: input.payload.conversationId,
                intent: effectiveRoutedIntent,
                ...(uiPayload ? { ui: uiPayload } : {}),
              };
            }
          } catch (error: unknown) {
            response = mapContextOrBackendError(error);
          }
        }
      }

      if (!response) {
        response = {
          ok: false,
          message: BACKEND_ERROR_MESSAGE,
        };
      }

      const sanitizedAssistantOutput = sanitizeAssistantUserMessage(response.message);
      if (sanitizedAssistantOutput.rewritten) {
        this.metricsPort.incrementOutputTechnicalTermsSanitized();
        this.logger.chat('assistant_output_sanitized', {
          event: 'assistant_output_sanitized',
          request_id: input.requestId,
          conversation_id: input.payload.conversationId,
          intent: response.ok ? (response.intent ?? effectiveRoutedIntent) : 'error',
          rewrite_reason_count: sanitizedAssistantOutput.reasons.length,
          rewrite_reasons: sanitizedAssistantOutput.reasons,
        });
      }
      response = {
        ...response,
        message: sanitizedAssistantOutput.message,
      };

      if (
        ordersEscalationFlowStateToPersist === undefined &&
        shouldSuggestCancelledOrderEscalation(response.message)
      ) {
        ordersEscalationFlowStateToPersist = 'awaiting_cancelled_reason_confirmation';
      }

      const auditStatus = getResponseAuditStatus(response);
      const contextTypes = Array.isArray(contextBlocks)
        ? contextBlocks.map((block) => block.contextType)
        : [];
      const storeInfoSubtype = resolveStoreInfoSubtype(contextBlocks);
      const storeInfoPolicyVersion = storeInfoSubtype
        ? STORE_INFO_POLICY_VERSION
        : null;
      const uiCardsCount = uiPayload?.cards.length ?? 0;
      const uiCardsWithImageCount =
        uiPayload?.cards.filter(
          (card) => typeof card.thumbnailUrl === 'string' && card.thumbnailUrl.length > 0,
        ).length ?? 0;
      const catalogSnapshotMetadata =
        catalogSnapshot.length > 0 ? { catalogSnapshot } : {};
      const guestOrderFlowMetadata =
        guestOrderFlowStateToPersist === undefined
          ? {}
          : { ordersGuestFlowState: guestOrderFlowStateToPersist };
      const recommendationsFlowMetadata = buildRecommendationsFlowMetadata({
        state: recommendationsFlowStateToPersist,
        franchise: recommendationsFlowFranchiseToPersist,
        categoryHint: recommendationsFlowCategoryHintToPersist,
      });
      const ordersEscalationFlowMetadata = buildOrdersEscalationFlowMetadata(
        ordersEscalationFlowStateToPersist,
      );

      const persistedTurn = await this.chatPersistence.persistTurn({
        conversationId: input.payload.conversationId,
        userId: effectiveUserId,
        source: input.payload.source,
        externalEventId: input.externalEventId,
        userMessage: sanitizedText,
        botMessage: response.message,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        metadata: {
          requiresAuth: auditStatus.requiresAuth,
          predictedIntent: routedIntent,
          predictedConfidence: validatedIntent.confidence,
          predictedEntitiesCount: validatedIntent.entities.length,
          sentiment: validatedIntent.sentiment,
          responsePolicyVersion: 'v2-banded-stock',
          llmPath: llmMetadata?.llmPath ?? 'fallback_default',
          fallbackReason: llmMetadata?.fallbackReason ?? null,
          promptVersion: llmMetadata?.promptVersion ?? null,
          inputTokenCount: llmMetadata?.inputTokenCount ?? null,
          outputTokenCount: llmMetadata?.outputTokenCount ?? null,
          cachedTokenCount: llmMetadata?.cachedTokenCount ?? null,
          contextTypes,
          sessionId: input.payload.conversationId,
          traceId: input.requestId,
          spanId: input.externalEventId.slice(0, 16),
          discloseExactStock: exactStockDisclosed,
          lowStockThreshold: 3,
          storeInfoSubtype,
          storeInfoPolicyVersion,
          uiPayloadVersion: uiPayload?.version ?? null,
          uiKind: uiPayload?.kind ?? null,
          uiCardsCount,
          uiCardsWithImageCount,
          ...catalogSnapshotMetadata,
          ...guestOrderFlowMetadata,
          ...recommendationsFlowMetadata,
          ...ordersEscalationFlowMetadata,
        },
      });

      if (response.ok) {
        response = {
          ...response,
          responseId: persistedTurn.botMessageId,
        };
      }

      this.logger.info('final_stage_persisted', {
        event: 'final_stage_persisted',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        source: input.payload.source,
        outbox_expected: input.payload.source === 'whatsapp',
        latency_ms: Date.now() - startedAt,
      });

      await this.idempotencyPort.markProcessed({
        source: input.payload.source,
        externalEventId: input.externalEventId,
      });

      await this.auditPort.writeAudit({
        requestId: input.requestId,
        userId: effectiveUserId,
        conversationId: input.payload.conversationId,
        source: input.payload.source,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        status: auditStatus.status,
        message: response.message,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        metadata: {
          externalEventId: input.externalEventId,
          predictedIntent: routedIntent,
          predictedConfidence: validatedIntent.confidence,
          predictedEntitiesCount: validatedIntent.entities.length,
          sentiment: validatedIntent.sentiment,
          responseType: auditStatus.responseType,
          responsePolicyVersion: 'v2-banded-stock',
          llmPath: llmMetadata?.llmPath ?? 'fallback_default',
          fallbackReason: llmMetadata?.fallbackReason ?? null,
          promptVersion: llmMetadata?.promptVersion ?? null,
          inputTokenCount: llmMetadata?.inputTokenCount ?? null,
          outputTokenCount: llmMetadata?.outputTokenCount ?? null,
          cachedTokenCount: llmMetadata?.cachedTokenCount ?? null,
          contextTypes,
          sessionId: input.payload.conversationId,
          traceId: input.requestId,
          spanId: input.externalEventId.slice(0, 16),
          discloseExactStock: exactStockDisclosed,
          lowStockThreshold: 3,
          storeInfoSubtype,
          storeInfoPolicyVersion,
          uiPayloadVersion: uiPayload?.version ?? null,
          uiKind: uiPayload?.kind ?? null,
          uiCardsCount,
          uiCardsWithImageCount,
          ...guestOrderFlowMetadata,
          ...recommendationsFlowMetadata,
          ...ordersEscalationFlowMetadata,
        },
      });

      const llmPath = llmMetadata?.llmPath ?? 'fallback_default';
      this.metricsPort.incrementMessage({
        source: input.payload.source,
        intent: response.ok ? (response.intent ?? effectiveRoutedIntent) : 'error',
        llmPath,
      });
      this.metricsPort.observeResponseLatency({
        intent: response.ok ? (response.intent ?? effectiveRoutedIntent) : 'error',
        seconds: (Date.now() - startedAt) / 1000,
      });
      if (exactStockDisclosed) {
        this.metricsPort.incrementStockExactDisclosure();
      }

      this.logger.info('final_stage_audited', {
        event: 'final_stage_audited',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        source: input.payload.source,
        status: auditStatus.status,
        latency_ms: Date.now() - startedAt,
      });

      return response;
    } catch (error: unknown) {
      this.logger.error(
        'WF1 processing failed',
        error instanceof Error ? error : undefined,
        { requestId: input.requestId },
      );

      await this.idempotencyPort.markFailed({
        source: input.payload.source,
        externalEventId: input.externalEventId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      const fallbackResponse: Wf1Response = {
        ok: false,
        message: BACKEND_ERROR_MESSAGE,
      };

      await this.auditPort.writeAudit({
        requestId: input.requestId,
        userId: input.payload.userId,
        conversationId: input.payload.conversationId,
        source: input.payload.source,
        intent: 'error',
        status: 'failure',
        message: fallbackResponse.message,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.name : 'UnknownError',
        metadata: {
          externalEventId: input.externalEventId,
        },
      });

      this.logger.info('final_stage_audited', {
        event: 'final_stage_audited',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        intent: 'error',
        source: input.payload.source,
        status: 'failure',
        latency_ms: Date.now() - startedAt,
      });

      this.metricsPort.incrementMessage({
        source: input.payload.source,
        intent: 'error',
        llmPath: 'fallback_default',
      });
      this.metricsPort.observeResponseLatency({
        intent: 'error',
        seconds: (Date.now() - startedAt) / 1000,
      });
      this.metricsPort.incrementFallback('unknown');

      return fallbackResponse;
    }
  }

  private async handleGuestOrderLookup(input: {
    requestId: string;
    conversationId: string;
    userId: string;
    clientIp?: string;
    text: string;
    entities: string[];
    currentFlowState: GuestOrderFlowState;
  }): Promise<GuestOrderLookupFlowResult> {
    const resolved = resolveOrderLookupRequest({
      text: input.text,
      entities: input.entities,
    });

    const orderId = resolved.orderId;
    const hasCompleteLookupData = typeof orderId === 'number' && resolved.providedFactors >= 2;
    if (hasCompleteLookupData) {
      const rateLimitDecision = await this.orderLookupRateLimiter.consume({
        requestId: input.requestId,
        userId: input.userId,
        conversationId: input.conversationId,
        orderId,
        clientIp: input.clientIp,
      });

      if (rateLimitDecision.degraded) {
        this.metricsPort.incrementOrderLookupRateLimitDegraded();
      }

      if (!rateLimitDecision.allowed) {
        this.metricsPort.incrementOrderLookupRateLimited(rateLimitDecision.blockedBy ?? 'order');
        return {
          response: buildOrderLookupThrottledResponse(),
          nextFlowState: 'awaiting_lookup_payload',
        };
      }

      const lookupResponse = await this.executeGuestOrderLookup({
        requestId: input.requestId,
        conversationId: input.conversationId,
        orderId,
        identity: resolved.identity,
      });
      return {
        response: lookupResponse,
        nextFlowState: lookupResponse.ok ? null : 'awaiting_lookup_payload',
      };
    }

    if (input.currentFlowState === null) {
      if (hasOrderLookupSignals(resolved)) {
        return {
          response: this.buildGuestOrderLookupMissingDataResponse(resolved),
          nextFlowState: 'awaiting_lookup_payload',
        };
      }

      return {
        response: buildOrderLookupHasDataQuestionResponse(),
        nextFlowState: 'awaiting_has_data_answer',
      };
    }

    const hasOrderDataAnswer = resolveHasOrderDataAnswer(input.text);

    if (hasOrderDataAnswer === 'no') {
      return {
        response: buildOrdersRequiresAuthResponse(),
        nextFlowState: null,
      };
    }

    if (input.currentFlowState === 'awaiting_has_data_answer') {
      if (hasOrderDataAnswer === 'yes') {
        return {
          response: buildOrderLookupProvideDataResponse(),
          nextFlowState: 'awaiting_lookup_payload',
        };
      }

      if (hasOrderLookupSignals(resolved)) {
        return {
          response: this.buildGuestOrderLookupMissingDataResponse(resolved),
          nextFlowState: 'awaiting_lookup_payload',
        };
      }

      return {
        response: buildOrderLookupUnknownHasDataAnswerResponse(),
        nextFlowState: 'awaiting_has_data_answer',
      };
    }

    if (hasOrderDataAnswer === 'yes' && !hasOrderLookupSignals(resolved)) {
      return {
        response: buildOrderLookupProvideDataResponse(),
        nextFlowState: 'awaiting_lookup_payload',
      };
    }

    return {
      response: this.buildGuestOrderLookupMissingDataResponse(resolved),
      nextFlowState: 'awaiting_lookup_payload',
    };
  }

  private async executeGuestOrderLookup(input: {
    requestId: string;
    conversationId: string;
    orderId: number;
    identity: {
      dni?: string;
      name?: string;
      lastName?: string;
      phone?: string;
    };
  }): Promise<Wf1Response> {
    try {
      const lookup = await this.orderLookupClient.lookupOrder({
        requestId: input.requestId,
        orderId: input.orderId,
        identity: input.identity,
      });

      if (lookup.ok) {
        return {
          ok: true,
          conversationId: input.conversationId,
          intent: 'orders',
          message: buildOrderLookupSuccessMessage(lookup.order),
        };
      }

      if (lookup.code === 'not_found_or_mismatch') {
        this.metricsPort.incrementOrderLookupVerificationFailed();
        return buildOrderLookupVerificationFailedResponse();
      }

      if (lookup.code === 'invalid_payload') {
        return buildOrderLookupInvalidPayloadResponse();
      }

      if (lookup.code === 'unauthorized') {
        return buildOrderLookupUnauthorizedResponse();
      }

      if (lookup.code === 'throttled') {
        this.metricsPort.incrementOrderLookupRateLimited('backend');
        return buildOrderLookupThrottledResponse();
      }

      return {
        ok: false,
        message: BACKEND_ERROR_MESSAGE,
      };
    } catch (error: unknown) {
      this.logger.warn('guest_order_lookup_failed', {
        event: 'guest_order_lookup_failed',
        request_id: input.requestId,
        error_type: error instanceof Error ? error.name : 'UnknownError',
      });

      return {
        ok: false,
        message: BACKEND_ERROR_MESSAGE,
      };
    }
  }

  private buildGuestOrderLookupMissingDataResponse(input: {
    orderId?: number;
    providedFactors: number;
    invalidFactors: string[];
  }): Wf1Response {
    if (!input.orderId) {
      return buildOrderLookupMissingOrderIdResponse();
    }

    if (input.invalidFactors.length > 0) {
      return buildOrderLookupInvalidPayloadResponse({
        invalidFactors: input.invalidFactors,
      });
    }

    if (input.providedFactors < 2) {
      return buildOrderLookupMissingIdentityFactorsResponse({
        providedFactors: input.providedFactors,
      });
    }

    return buildOrderLookupInvalidPayloadResponse();
  }

  private handlePendingOrdersEscalationFlow(input: {
    text: string;
    historyRows: ConversationHistoryRow[];
  }): PendingOrdersEscalationFlowResult {
    const answer = resolveCancelledOrderEscalationAnswer(input.text);
    const orderId = resolveRecentCancelledOrderId(input.historyRows);

    if (answer === 'yes') {
      return {
        response: buildCancelledOrderEscalationActionResponse({
          orderId,
        }),
        nextFlowState: null,
      };
    }

    if (answer === 'no') {
      return {
        response: buildCancelledOrderEscalationDeclinedResponse(),
        nextFlowState: null,
      };
    }

    return {
      response: buildCancelledOrderEscalationUnknownAnswerResponse(),
      nextFlowState: 'awaiting_cancelled_reason_confirmation',
    };
  }

  private handlePendingRecommendationsFlow(input: {
    currentFlow: RecommendationFlowStateSnapshot;
    text: string;
    entities: string[];
  }): PendingRecommendationFlowResult {
    const followup = resolveRecommendationFollowup({
      text: input.text,
      entities: input.entities,
    });

    if (!followup.hasSignals) {
      return {
        response: undefined,
        rewrittenText: input.text,
        entitiesOverride: input.entities,
        nextState: input.currentFlow.state,
        nextFranchise: input.currentFlow.franchise,
        nextCategoryHint: input.currentFlow.categoryHint,
        resolved: false,
      };
    }

    const franchise = followup.mentionedFranchise ?? input.currentFlow.franchise;
    if (!franchise) {
      return {
        response: undefined,
        rewrittenText: input.text,
        entitiesOverride: input.entities,
        nextState: null,
        nextFranchise: null,
        nextCategoryHint: null,
        resolved: false,
      };
    }

    if (input.currentFlow.state === 'awaiting_category_or_volume') {
      const categoryHint = followup.requestedType ?? input.currentFlow.categoryHint;

      if (followup.volumeNumber || followup.wantsLatest || followup.wantsStart) {
        return {
          response: undefined,
          rewrittenText: buildRecommendationsRewriteText({
            franchise,
            categoryHint,
            volumeNumber: followup.volumeNumber,
            wantsLatest: followup.wantsLatest,
            wantsStart: followup.wantsStart,
          }),
          entitiesOverride: [franchise],
          nextState: null,
          nextFranchise: null,
          nextCategoryHint: null,
          resolved: true,
        };
      }

      if (categoryHint) {
        const categoryLabel = formatRecommendationCategoryLabel(categoryHint);
        if (categoryHint === 'mangas' || categoryHint === 'comics') {
          return {
            response: buildRecommendationsVolumeDisambiguationResponse({
              franchiseLabel: franchise.replace(/_/g, ' '),
              categoryLabel,
            }),
            rewrittenText: input.text,
            entitiesOverride: input.entities,
            nextState: 'awaiting_volume_detail',
            nextFranchise: franchise,
            nextCategoryHint: categoryHint,
            resolved: false,
          };
        }

        return {
          response: undefined,
          rewrittenText: buildRecommendationsRewriteText({
            franchise,
            categoryHint,
            volumeNumber: null,
            wantsLatest: false,
            wantsStart: false,
          }),
          entitiesOverride: [franchise],
          nextState: null,
          nextFranchise: null,
          nextCategoryHint: null,
          resolved: true,
        };
      }

      return {
        response: buildRecommendationsUnknownFollowupResponse({
          franchiseLabel: franchise.replace(/_/g, ' '),
          state: 'awaiting_category_or_volume',
        }),
        rewrittenText: input.text,
        entitiesOverride: input.entities,
        nextState: 'awaiting_category_or_volume',
        nextFranchise: franchise,
        nextCategoryHint: null,
        resolved: false,
      };
    }

    if (input.currentFlow.state === 'awaiting_volume_detail') {
      const categoryHint = input.currentFlow.categoryHint ?? followup.requestedType;

      if (followup.volumeNumber || followup.wantsLatest || followup.wantsStart) {
        return {
          response: undefined,
          rewrittenText: buildRecommendationsRewriteText({
            franchise,
            categoryHint,
            volumeNumber: followup.volumeNumber,
            wantsLatest: followup.wantsLatest,
            wantsStart: followup.wantsStart,
          }),
          entitiesOverride: [franchise],
          nextState: null,
          nextFranchise: null,
          nextCategoryHint: null,
          resolved: true,
        };
      }

      return {
        response: buildRecommendationsUnknownFollowupResponse({
          franchiseLabel: franchise.replace(/_/g, ' '),
          state: 'awaiting_volume_detail',
          categoryLabel: formatRecommendationCategoryLabel(categoryHint),
        }),
        rewrittenText: input.text,
        entitiesOverride: input.entities,
        nextState: 'awaiting_volume_detail',
        nextFranchise: franchise,
        nextCategoryHint: categoryHint,
        resolved: false,
      };
    }

    return {
      response: undefined,
      rewrittenText: input.text,
      entitiesOverride: input.entities,
      nextState: null,
      nextFranchise: null,
      nextCategoryHint: null,
      resolved: false,
    };
  }

  private buildRecommendationsDisambiguationResponseFromContext(input: {
    contextBlocks:
      | Array<{ contextType: string; contextPayload: Record<string, unknown> }>
      | undefined;
    conversationId: string;
  }): {
    response: Wf1Response;
    nextState: RecommendationDisambiguationState;
    nextFranchise: string | null;
    nextCategoryHint: string | null;
  } | null {
    if (!Array.isArray(input.contextBlocks)) {
      return null;
    }

    const block = input.contextBlocks.find(
      (entry) => entry.contextType === 'recommendations',
    );
    if (!block) {
      return null;
    }

    const needsDisambiguation = block.contextPayload['needsDisambiguation'] === true;
    if (!needsDisambiguation) {
      return null;
    }

    const reason =
      typeof block.contextPayload['disambiguationReason'] === 'string'
        ? block.contextPayload['disambiguationReason']
        : null;
    const franchise =
      typeof block.contextPayload['disambiguationFranchise'] === 'string'
        ? block.contextPayload['disambiguationFranchise']
        : null;
    const suggestedTypes = Array.isArray(block.contextPayload['disambiguationSuggestedTypes'])
      ? (block.contextPayload['disambiguationSuggestedTypes'] as unknown[])
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    const totalCandidates =
      typeof block.contextPayload['disambiguationTotalCandidates'] === 'number'
        ? block.contextPayload['disambiguationTotalCandidates']
        : 0;

    if (!franchise) {
      return null;
    }

    if (reason === 'volume_scope') {
      const categoryHint = suggestedTypes[0] ?? 'mangas';
      return {
        response: buildRecommendationsVolumeDisambiguationResponse({
          franchiseLabel: franchise.replace(/_/g, ' '),
          categoryLabel: formatRecommendationCategoryLabel(categoryHint),
        }),
        nextState: 'awaiting_volume_detail',
        nextFranchise: franchise,
        nextCategoryHint: categoryHint,
      };
    }

    return {
      response: buildRecommendationsFranchiseDisambiguationResponse({
        franchiseLabel: franchise.replace(/_/g, ' '),
        totalCandidates,
        suggestedTypes,
      }),
      nextState: 'awaiting_category_or_volume',
      nextFranchise: franchise,
      nextCategoryHint: null,
    };
  }

  private recordRecommendationsObservability(input: {
    requestId: string;
    conversationId: string;
    intent: string;
    contextBlocks: Array<{ contextType: string; contextPayload: Record<string, unknown> }>;
  }): void {
    if (input.intent !== 'recommendations') {
      return;
    }

    const recommendationsBlock = input.contextBlocks.find(
      (block) => block.contextType === 'recommendations',
    );
    if (!recommendationsBlock) {
      return;
    }

    const fallbackReason = getContextStringField(recommendationsBlock.contextPayload, 'fallbackReason');
    const matchedFranchises = getContextStringArrayField(
      recommendationsBlock.contextPayload,
      'matchedFranchises',
    );
    const matchedBrands = getContextStringArrayField(
      recommendationsBlock.contextPayload,
      'matchedBrands',
    );
    const suggestedBrands = getContextStringArrayField(
      recommendationsBlock.contextPayload,
      'suggestedBrands',
    );

    this.logger.chat('recommendations_context_built', {
      event: 'recommendations_context_built',
      request_id: input.requestId,
      conversation_id: input.conversationId,
      intent: input.intent,
      fallback_reason: fallbackReason ?? 'none',
      catalog_status: fallbackReason === 'catalog_unavailable' ? 'degraded' : 'ok',
      matched_franchises_count: matchedFranchises.length,
      matched_brands_count: matchedBrands.length,
      suggested_brands_count: suggestedBrands.length,
    });

    if (matchedFranchises.length > 0) {
      this.metricsPort.incrementRecommendationsFranchiseMatch();
    }

    if (matchedBrands.length > 0) {
      this.metricsPort.incrementRecommendationsEditorialMatch();
    }

    if (suggestedBrands.length > 0) {
      this.metricsPort.incrementRecommendationsEditorialSuggested();
    }

    if (fallbackReason === 'catalog_unavailable') {
      this.metricsPort.incrementRecommendationsCatalogDegraded();
      return;
    }

    if (fallbackReason === 'no_matches') {
      this.metricsPort.incrementRecommendationsNoMatch();
    }
  }

  private async appendAdaptiveExemplarContext(input: {
    contextBlocks: ContextBlock[];
    intent: IntentName;
  }): Promise<ContextBlock[]> {
    const contextBlocks = input.contextBlocks;
    if (!this.recursiveLearningEnabled) {
      return contextBlocks;
    }

    const exemplars = await this.adaptiveExemplars.getActiveExemplarsByIntent({
      intent: input.intent,
      limit: 2,
    });

    if (exemplars.length === 0) {
      return contextBlocks;
    }

    for (const exemplar of exemplars) {
      this.metricsPort.incrementExemplarsUsedInPrompt({
        intent: input.intent,
        source: exemplar.source,
      });
    }

    const hints = exemplars
      .map((exemplar, index) => `${index + 1}. ${exemplar.promptHint}`)
      .join('\n');

    return [
      ...contextBlocks,
      {
        contextType: 'general',
        contextPayload: {
          hint: `Guia de calidad validada para ${input.intent}:\n${hints}`,
        },
      },
    ];
  }

  private async resolveUserContext(payload: ChatRequestDto): Promise<UserContext> {
    const accessToken = payload.accessToken;
    if (!checkIfAuthenticated(accessToken)) {
      return this.chatPersistence.upsertUser(payload.userId);
    }

    if (typeof accessToken !== 'string') {
      return this.chatPersistence.upsertUser(payload.userId);
    }

    let profile: Awaited<ReturnType<EntelequiaContextPort['getAuthenticatedUserProfile']>>;
    try {
      profile = await this.entelequiaContextPort.getAuthenticatedUserProfile({
        accessToken,
      });
    } catch (error: unknown) {
      if (error instanceof ExternalServiceError && error.statusCode === 401) {
        // Token is present but invalid/expired: continue as guest and let protected intents map to requiresAuth.
        return this.chatPersistence.upsertUser(payload.userId);
      }

      throw error;
    }

    const resolvedUserId =
      typeof profile.id === 'string' && profile.id.trim().length > 0
        ? profile.id.trim()
        : payload.userId;
    const email = profile.email.trim();
    const name = profile.name.trim();

    if (email.length === 0 || name.length === 0) {
      throw new Error('Invalid authenticated profile payload');
    }

    return this.chatPersistence.upsertAuthenticatedUserProfile({
      id: resolvedUserId,
      email,
      phone: profile.phone.trim(),
      name,
    });
  }
}

interface GuestOrderLookupFlowResult {
  response: Wf1Response;
  nextFlowState: GuestOrderFlowState;
}

interface PendingRecommendationFlowResult {
  response: Wf1Response | undefined;
  rewrittenText: string;
  entitiesOverride: string[];
  nextState: RecommendationDisambiguationState;
  nextFranchise: string | null;
  nextCategoryHint: string | null;
  resolved: boolean;
}

interface PendingOrdersEscalationFlowResult {
  response: Wf1Response;
  nextFlowState: OrdersEscalationFlowState;
}

function normalizeLlmReply(
  input: string | { message: string; metadata?: LlmReplyMetadata },
): { message: string; metadata?: LlmReplyMetadata } {
  if (typeof input === 'string') {
    return { message: input };
  }

  return {
    message: input.message,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function resolveExactStockDisclosure(
  contextBlocks: Array<{ contextType: string; contextPayload: Record<string, unknown> }>,
): boolean {
  const products = contextBlocks.find((block) => block.contextType === 'products');
  if (!products) {
    return false;
  }

  return products.contextPayload['discloseExactStock'] === true;
}

function resolveStoreInfoSubtype(
  contextBlocks?: Array<{ contextType: string; contextPayload: Record<string, unknown> }>,
): string | null {
  if (!Array.isArray(contextBlocks)) {
    return null;
  }

  const storeInfo = contextBlocks.find((block) => block.contextType === 'store_info');
  if (!storeInfo) {
    return null;
  }

  const infoRequested = storeInfo.contextPayload['infoRequested'];
  return typeof infoRequested === 'string' && infoRequested.length > 0
    ? infoRequested
    : null;
}

function resolveBooleanFlag(
  value: string | boolean | undefined,
  fallback: boolean,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function hasCatalogUiContext(contextBlocks: ContextBlock[]): boolean {
  return contextBlocks.some(
    (block) => block.contextType === 'products' || block.contextType === 'recommendations',
  );
}

function isCatalogUiMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.['uiKind'] === 'catalog';
}

function buildRecommendationsRewriteText(input: {
  franchise: string;
  categoryHint: string | null;
  volumeNumber: number | null;
  wantsLatest: boolean;
  wantsStart: boolean;
}): string {
  const franchise = input.franchise.replace(/_/g, ' ');
  const category = formatRecommendationCategoryLabel(input.categoryHint);

  if (input.volumeNumber) {
    return `recomendame ${category} de ${franchise} tomo ${input.volumeNumber}`;
  }

  if (input.wantsStart) {
    return `recomendame ${category} de ${franchise} desde el inicio`;
  }

  if (input.wantsLatest) {
    return `recomendame ${category} de ${franchise} ultimos lanzamientos`;
  }

  return `recomendame ${category} de ${franchise}`;
}

function buildRecommendationsFlowMetadata(input: {
  state: RecommendationDisambiguationState | undefined;
  franchise: string | null | undefined;
  categoryHint: string | null | undefined;
}): Record<string, unknown> {
  if (input.state === undefined && input.franchise === undefined && input.categoryHint === undefined) {
    return {};
  }

  return {
    [RECOMMENDATIONS_FLOW_STATE_METADATA_KEY]: input.state ?? null,
    [RECOMMENDATIONS_FLOW_FRANCHISE_METADATA_KEY]: input.franchise ?? null,
    [RECOMMENDATIONS_FLOW_CATEGORY_HINT_METADATA_KEY]: input.categoryHint ?? null,
  };
}

function buildOrdersEscalationFlowMetadata(
  state: OrdersEscalationFlowState | undefined,
): Record<string, unknown> {
  if (state === undefined) {
    return {};
  }

  return {
    [ORDERS_ESCALATION_FLOW_STATE_METADATA_KEY]: state,
  };
}

function getContextStringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function getContextStringArrayField(
  payload: Record<string, unknown>,
  key: string,
): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
