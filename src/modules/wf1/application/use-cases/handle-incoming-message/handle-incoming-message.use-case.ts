import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
  METRICS_PORT,
  PROMPT_TEMPLATES_PORT,
} from '../../ports/tokens';
import type { AuditPort } from '../../ports/audit.port';
import type { ChatPersistencePort } from '../../ports/chat-persistence.port';
import type { EntelequiaContextPort } from '../../ports/entelequia-context.port';
import type { IdempotencyPort } from '../../ports/idempotency.port';
import type { IntentExtractorPort } from '../../ports/intent-extractor.port';
import type { LlmPort, LlmReplyMetadata } from '../../ports/llm.port';
import type { MetricsPort } from '../../ports/metrics.port';
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
import { appendStaticContextBlock } from '../../../domain/context-block';
import { sanitizeText } from '../../../domain/text-sanitizer';
import { validateAndEnrichIntentOutput } from '../../../domain/output-validation';
import { resolveIntentRoute } from '../../../domain/intent-routing';
import type { UiPayloadV1 } from '../../../domain/ui-payload';
import { buildCatalogUiPayload } from '../../../domain/ui-payload';
import { createLogger } from '../../../../../common/utils/logger';
import { EnrichContextByIntentUseCase } from '../enrich-context-by-intent';
import { EntelequiaOrderLookupClient } from '../../../infrastructure/adapters/entelequia-http';
import {
  BACKEND_ERROR_MESSAGE,
  mapContextOrBackendError,
} from './error-mapper';
import { checkIfAuthenticated } from './check-if-authenticated';
import {
  buildOrderLookupInvalidPayloadResponse,
  buildOrderLookupMissingIdentityFactorsResponse,
  buildOrderLookupMissingOrderIdResponse,
  buildOrderLookupSuccessMessage,
  buildOrderLookupThrottledResponse,
  buildOrderLookupUnauthorizedResponse,
  buildOrderLookupVerificationFailedResponse,
} from './orders-order-lookup-response';
import { resolveOrderLookupRequest } from './resolve-order-lookup-request';

const STORE_INFO_POLICY_VERSION = 'v2-exact-weekly-hours';

@Injectable()
export class HandleIncomingMessageUseCase {
  private readonly logger = createLogger(HandleIncomingMessageUseCase.name);
  private readonly historyLimit: number;
  private readonly uiCardsEnabled: boolean;

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
    private readonly configService: ConfigService,
  ) {
    const configuredLimit =
      this.configService.get<number>('CHAT_HISTORY_LIMIT') ??
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES;
    this.historyLimit = Math.min(
      Math.max(0, configuredLimit),
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
    );
    this.uiCardsEnabled = resolveUiCardsEnabled(
      this.configService.get<string | boolean>('WF1_UI_CARDS_ENABLED'),
    );
  }

  async execute(input: {
    requestId: string;
    externalEventId: string;
    payload: ChatRequestDto;
    idempotencyPayload: Record<string, unknown>;
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
      const previous = await this.chatPersistence.getLastBotMessageByExternalEvent({
        channel: input.payload.source,
        externalEventId: input.externalEventId,
      });

      const duplicateResponse: Wf1Response = {
        ok: true,
        message: previous ?? 'Este mensaje ya fue procesado.',
        conversationId: input.payload.conversationId,
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
      let response: Wf1Response;
      let llmMetadata: LlmReplyMetadata | undefined;
      let exactStockDisclosed = false;
      let uiPayload: UiPayloadV1 | undefined;

      if (routedIntent === 'orders' && !checkIfAuthenticated(input.payload.accessToken)) {
        response = await this.handleGuestOrderLookup({
          requestId: input.requestId,
          conversationId: input.payload.conversationId,
          text: sanitizedText,
          entities: validatedIntent.entities,
        });
      } else {
        try {
          contextBlocks = await this.enrichContextByIntent.execute({
            intentResult: routedIntentResult,
            text: sanitizedText,
            sentiment: validatedIntent.sentiment,
            currency: input.payload.currency,
            accessToken: input.payload.accessToken,
          });

          contextBlocks = appendStaticContextBlock(
            contextBlocks,
            this.promptTemplates.getStaticContext(),
          );

          const llmReply = await this.llmPort.buildAssistantReply({
            requestId: input.requestId,
            conversationId: input.payload.conversationId,
            externalEventId: input.externalEventId,
            userText: sanitizedText,
            intent: routedIntent,
            history,
            contextBlocks,
          });

          const { message, metadata } = normalizeLlmReply(llmReply);
          llmMetadata = metadata;
          exactStockDisclosed = resolveExactStockDisclosure(contextBlocks);
          uiPayload = this.uiCardsEnabled
            ? buildCatalogUiPayload(contextBlocks)
            : undefined;

          response = {
            ok: true,
            message,
            conversationId: input.payload.conversationId,
            intent: routedIntent,
            ...(uiPayload ? { ui: uiPayload } : {}),
          };
        } catch (error: unknown) {
          response = mapContextOrBackendError(error);
        }
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

      await this.chatPersistence.persistTurn({
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
        },
      });

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
        },
      });

      const llmPath = llmMetadata?.llmPath ?? 'fallback_default';
      this.metricsPort.incrementMessage({
        source: input.payload.source,
        intent: response.ok ? (response.intent ?? routedIntent) : 'error',
        llmPath,
      });
      this.metricsPort.observeResponseLatency({
        intent: response.ok ? (response.intent ?? routedIntent) : 'error',
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
    text: string;
    entities: string[];
  }): Promise<Wf1Response> {
    const resolved = resolveOrderLookupRequest({
      text: input.text,
      entities: input.entities,
    });

    if (!resolved.orderId) {
      return buildOrderLookupMissingOrderIdResponse();
    }

    if (resolved.providedFactors < 2) {
      return buildOrderLookupMissingIdentityFactorsResponse({
        providedFactors: resolved.providedFactors,
      });
    }

    try {
      const lookup = await this.orderLookupClient.lookupOrder({
        requestId: input.requestId,
        orderId: resolved.orderId,
        identity: resolved.identity,
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
        return buildOrderLookupVerificationFailedResponse();
      }

      if (lookup.code === 'invalid_payload') {
        return buildOrderLookupInvalidPayloadResponse();
      }

      if (lookup.code === 'unauthorized') {
        return buildOrderLookupUnauthorizedResponse();
      }

      if (lookup.code === 'throttled') {
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

function resolveUiCardsEnabled(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
