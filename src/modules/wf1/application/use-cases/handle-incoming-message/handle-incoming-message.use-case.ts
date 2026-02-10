import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
} from '../../ports/tokens';
import type { AuditPort } from '../../ports/audit.port';
import type { ChatPersistencePort } from '../../ports/chat-persistence.port';
import type { IdempotencyPort } from '../../ports/idempotency.port';
import type { IntentExtractorPort } from '../../ports/intent-extractor.port';
import type { LlmPort } from '../../ports/llm.port';
import type { ChatRequestDto } from '../../../dto/chat-request.dto';
import type { Wf1Response } from '../../../domain/wf1-response';
import { prepareConversationQuery } from '../../../domain/prepare-conversation-query';
import { WF1_MAX_TEXT_CHARS } from '../../../domain/text-policy';
import {
  WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
  mapConversationHistoryRowsToMessageHistoryItems,
} from '../../../domain/conversation-history';
import { sanitizeText } from '../../../domain/text-sanitizer';
import { validateAndEnrichIntentOutput } from '../../../domain/output-validation';
import { resolveIntentRoute } from '../../../domain/intent-routing';
import { createLogger } from '../../../../../common/utils/logger';
import { EnrichContextByIntentUseCase } from '../enrich-context-by-intent';
import { mapContextOrBackendError } from './error-mapper';

@Injectable()
export class HandleIncomingMessageUseCase {
  private readonly logger = createLogger(HandleIncomingMessageUseCase.name);
  private readonly historyLimit: number;

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
    private readonly enrichContextByIntent: EnrichContextByIntentUseCase,
    private readonly configService: ConfigService,
  ) {
    const configuredLimit =
      this.configService.get<number>('CHAT_HISTORY_LIMIT') ??
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES;
    this.historyLimit = Math.min(
      Math.max(0, configuredLimit),
      WF1_MAX_CONVERSATION_HISTORY_MESSAGES,
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
      const user = await this.chatPersistence.upsertUser(input.payload.userId);
      const conversationContext = prepareConversationQuery(input.idempotencyPayload, user);

      await this.chatPersistence.upsertConversation({
        conversationId: input.payload.conversationId,
        userId: input.payload.userId,
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
        userId: input.payload.userId,
        conversationId: input.payload.conversationId,
      });

      const validatedIntent = validateAndEnrichIntentOutput({
        originalText: sanitizedText,
        intentResult,
      });
      const routedIntent = resolveIntentRoute(validatedIntent.intent);
      const routedIntentResult = { ...validatedIntent, intent: routedIntent };
      const enrichedData = { ...conversationContext, ...validatedIntent };

      if (validatedIntent.sentiment === 'negative') {
        this.logger.chat('sentiment_negative_detected', {
          event: 'sentiment_negative_detected',
          request_id: input.requestId,
          conversation_id: input.payload.conversationId,
          user_id: input.payload.userId,
          intent: routedIntent,
          confidence: validatedIntent.confidence,
          sentiment: validatedIntent.sentiment,
        });
      } else if (validatedIntent.sentiment === 'positive') {
        this.logger.chat('sentiment_positive_detected', {
          event: 'sentiment_positive_detected',
          request_id: input.requestId,
          conversation_id: input.payload.conversationId,
          user_id: input.payload.userId,
          intent: routedIntent,
          confidence: validatedIntent.confidence,
          sentiment: validatedIntent.sentiment,
        });
      } else {
        this.logger.chat('sentiment_neutral_detected', {
          event: 'sentiment_neutral_detected',
          request_id: input.requestId,
          conversation_id: input.payload.conversationId,
          user_id: input.payload.userId,
          intent: routedIntent,
          confidence: validatedIntent.confidence,
          sentiment: validatedIntent.sentiment,
        });
      }

      this.logger.chat('intent_routed', {
        event: 'intent_routed',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        user_id: input.payload.userId,
        intent_raw: validatedIntent.intent,
        intent_route: routedIntent,
      });

      this.logger.chat('output_validation_complete', {
        event: 'output_validation_complete',
        request_id: input.requestId,
        conversation_id: input.payload.conversationId,
        user_id: input.payload.userId,
        intent: routedIntent,
        confidence: validatedIntent.confidence,
        entities_count: validatedIntent.entities.length,
        sentiment: validatedIntent.sentiment,
        enriched_data_keys: Object.keys(enrichedData),
      });

      let contextBlocks;
      let response: Wf1Response;

      try {
        contextBlocks = await this.enrichContextByIntent.execute({
          intentResult: routedIntentResult,
          text: sanitizedText,
          currency: input.payload.currency,
          accessToken: input.payload.accessToken,
        });

        const message = await this.llmPort.buildAssistantReply({
          userText: sanitizedText,
          intent: routedIntent,
          history,
          contextBlocks,
        });

        response = {
          ok: true,
          message,
          conversationId: input.payload.conversationId,
          intent: routedIntent,
        };
      } catch (error: unknown) {
        response = mapContextOrBackendError(error);
      }

      await this.chatPersistence.persistTurn({
        conversationId: input.payload.conversationId,
        userId: input.payload.userId,
        source: input.payload.source,
        externalEventId: input.externalEventId,
        userMessage: sanitizedText,
        botMessage: response.message,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        metadata: {
          requiresAuth: response.ok === false && 'requiresAuth' in response,
          predictedIntent: routedIntent,
          predictedConfidence: validatedIntent.confidence,
          predictedEntitiesCount: validatedIntent.entities.length,
          sentiment: validatedIntent.sentiment,
        },
      });

      await this.idempotencyPort.markProcessed({
        source: input.payload.source,
        externalEventId: input.externalEventId,
      });

      await this.auditPort.writeAudit({
        requestId: input.requestId,
        userId: input.payload.userId,
        conversationId: input.payload.conversationId,
        source: input.payload.source,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        status:
          response.ok === true
            ? 'success'
            : response.ok === false && 'requiresAuth' in response
              ? 'requires_auth'
              : 'failure',
        message: response.message,
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        metadata: {
          externalEventId: input.externalEventId,
          predictedIntent: routedIntent,
          predictedConfidence: validatedIntent.confidence,
          predictedEntitiesCount: validatedIntent.entities.length,
          sentiment: validatedIntent.sentiment,
          responseType:
            response.ok === true
              ? 'success'
              : response.ok === false && 'requiresAuth' in response
                ? 'requiresAuth'
                : 'failure',
        },
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
        message: 'No pudimos procesar tu mensaje.',
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

      return fallbackResponse;
    }
  }
}
