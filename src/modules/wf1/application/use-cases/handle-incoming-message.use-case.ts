import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
} from '../ports/tokens';
import type { AuditPort } from '../ports/audit.port';
import type { ChatPersistencePort } from '../ports/chat-persistence.port';
import { ExternalServiceError } from '../../domain/errors';
import type { IdempotencyPort } from '../ports/idempotency.port';
import type { IntentExtractorPort } from '../ports/intent-extractor.port';
import type { LlmPort } from '../ports/llm.port';
import type { ChatRequestDto } from '../../dto/chat-request.dto';
import type { Wf1Response } from '../../domain/wf1-response';
import { WF1_MAX_TEXT_CHARS } from '../../domain/text-policy';
import { TextSanitizer } from '../../infrastructure/security/text-sanitizer';
import { MissingAuthForOrdersError } from '../../domain/errors';
import { createLogger } from '../../../../common/utils/logger';
import { EnrichContextByIntentUseCase } from './enrich-context-by-intent.use-case';

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
    private readonly textSanitizer: TextSanitizer,
    private readonly configService: ConfigService,
  ) {
    this.historyLimit = this.configService.get<number>('CHAT_HISTORY_LIMIT') ?? 10;
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

    const sanitizedText = this.textSanitizer.sanitize(input.payload.text);

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
      await this.chatPersistence.upsertUser(input.payload.userId);
      await this.chatPersistence.upsertConversation({
        conversationId: input.payload.conversationId,
        userId: input.payload.userId,
        channel: input.payload.source,
      });

      const history = await this.chatPersistence.getConversationHistory({
        conversationId: input.payload.conversationId,
        limit: this.historyLimit,
      });

      const intentResult = await this.intentExtractor.extractIntent({
        text: sanitizedText,
        requestId: input.requestId,
        source: input.payload.source,
        userId: input.payload.userId,
        conversationId: input.payload.conversationId,
      });

      let contextBlocks;
      let response: Wf1Response;

      try {
        contextBlocks = await this.enrichContextByIntent.execute({
          intentResult,
          text: sanitizedText,
          currency: input.payload.currency,
          accessToken: input.payload.accessToken,
        });

        const message = await this.llmPort.buildAssistantReply({
          userText: sanitizedText,
          intent: intentResult.intent,
          history,
          contextBlocks,
        });

        response = {
          ok: true,
          message,
          conversationId: input.payload.conversationId,
          intent: intentResult.intent,
        };
      } catch (error: unknown) {
        response = this.mapContextOrBackendError(error);
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

  private mapContextOrBackendError(error: unknown): Wf1Response {
    if (error instanceof MissingAuthForOrdersError) {
      return {
        ok: false,
        requiresAuth: true,
        message: 'Para consultar tus ordenes, inicia sesion.',
      };
    }

    if (error instanceof ExternalServiceError) {
      if (error.statusCode === 401) {
        return {
          ok: false,
          requiresAuth: true,
          message: 'Tu sesion expiro o es invalida. Inicia sesion nuevamente.',
        };
      }

      if (error.statusCode === 403) {
        return {
          ok: false,
          message: 'No tenes permisos para acceder a esa informacion.',
        };
      }

      if (error.statusCode === 442) {
        return {
          ok: false,
          message: 'No encontramos ese pedido en tu cuenta.',
        };
      }

      if (error.statusCode === 404) {
        return {
          ok: false,
          message: 'No encontramos la informacion solicitada.',
        };
      }

      if (error.statusCode >= 500 || error.errorCode === 'timeout' || error.errorCode === 'network') {
        return {
          ok: false,
          message: 'No pudimos procesar tu mensaje.',
        };
      }
    }

    return {
      ok: false,
      message: 'No pudimos procesar tu mensaje.',
    };
  }
}
