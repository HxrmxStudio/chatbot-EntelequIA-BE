import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { Request } from 'express';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { validateEnv } from '../src/common/config/env.validation';
import { SignatureValidationService } from '../src/modules/wf1/infrastructure/security/services/signature-validation';
import { TurnstileVerificationService } from '../src/modules/wf1/infrastructure/security/services/turnstile-verification';
import { InputValidationService } from '../src/modules/wf1/infrastructure/security/services/input-validation';
import { ExtractVariablesService } from '../src/modules/wf1/infrastructure/security/services/extract-variables';
import { TextSanitizer } from '../src/modules/wf1/infrastructure/security/services/text-sanitizer';
import { IntentExtractorAdapter } from '../src/modules/wf1/infrastructure/adapters/intent-extractor';
import { prepareConversationQuery } from '../src/modules/wf1/domain/prepare-conversation-query';
import { validateAndEnrichIntentOutput } from '../src/modules/wf1/domain/output-validation';
import { resolveIntentRoute } from '../src/modules/wf1/domain/intent-routing';
import { mapConversationHistoryRowsToMessageHistoryItems } from '../src/modules/wf1/domain/conversation-history';
import { appendStaticContextBlock, type ContextBlock } from '../src/modules/wf1/domain/context-block';
import type { Wf1Response } from '../src/modules/wf1/domain/wf1-response';
import { mapContextOrBackendError } from '../src/modules/wf1/application/use-cases/handle-incoming-message/error-mapper';
import { PG_POOL } from '../src/modules/wf1/application/ports/tokens';
import { ENTELEQUIA_CONTEXT_PORT } from '../src/modules/wf1/application/ports/tokens';
import { PROMPT_TEMPLATES_PORT } from '../src/modules/wf1/application/ports/tokens';
import { METRICS_PORT } from '../src/modules/wf1/application/ports/tokens';
import { EnrichContextByIntentUseCase } from '../src/modules/wf1/application/use-cases/enrich-context-by-intent';
import { EntelequiaHttpAdapter } from '../src/modules/wf1/infrastructure/adapters/entelequia-http';
import { OpenAiAdapter } from '../src/modules/wf1/infrastructure/adapters/openai';
import { PromptTemplatesAdapter } from '../src/modules/wf1/infrastructure/adapters/prompt-templates';
import {
  PgPoolProvider,
  pgPoolFactory,
} from '../src/modules/wf1/infrastructure/repositories/pg-pool.provider';
import { PgIdempotencyRepository } from '../src/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import { PgChatRepository } from '../src/modules/wf1/infrastructure/repositories/pg-chat.repository';
import { PgAuditRepository } from '../src/modules/wf1/infrastructure/repositories/pg-audit.repository';

type PlainObject = Record<string, unknown>;
type TraceSource = 'web' | 'whatsapp';

type TraceStage = 'output' | 'context' | 'llm' | 'persist';

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length === 0 ? '' : '<redacted>';
  }
  return '<redacted>';
}

function resolveTraceStage(value: unknown): TraceStage {
  if (typeof value !== 'string') {
    return 'output';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'context' || normalized === 'llm' || normalized === 'persist') {
    return normalized;
  }
  return 'output';
}

function resolveTraceSource(value: unknown): TraceSource {
  if (typeof value !== 'string') {
    return 'web';
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'whatsapp' ? 'whatsapp' : 'web';
}

function buildTraceRequest(input: {
  headers: Record<string, string>;
  externalEventId?: string;
  body: PlainObject;
  rawBody: string;
}): Request {
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(input.headers)) {
    if (value.trim().length > 0) {
      headers.set(name.toLowerCase(), value);
    }
  }

  if (input.externalEventId) {
    headers.set('x-external-event-id', input.externalEventId);
  }

  const request = {
    body: input.body,
    rawBody: input.rawBody,
    header: (name: string) => headers.get(name.toLowerCase()),
  };

  return request as unknown as Request;
}

function buildWhatsappSignature(input: { rawBody: string; secret: string }): string {
  return `sha256=${createHmac('sha256', input.secret).update(input.rawBody).digest('hex')}`;
}

function getRequestRawBody(request: Request): string {
  const candidate = (request as unknown as { rawBody?: unknown }).rawBody;
  return typeof candidate === 'string' ? candidate : '';
}

function computeExternalEventId(input: { request: Request; payload: PlainObject }): string {
  const explicitHeader =
    input.request.header('x-external-event-id') ?? input.request.header('x-idempotency-key');

  if (explicitHeader && explicitHeader.trim().length > 0) {
    return explicitHeader.trim().slice(0, 255);
  }

  const rawBody = getRequestRawBody(input.request);
  const rawCandidate =
    rawBody.trim().length > 0
      ? rawBody
      : JSON.stringify({
          source: input.payload.source,
          userId: input.payload.userId,
          conversationId: input.payload.conversationId,
          text: input.payload.text,
          currency: input.payload.currency ?? null,
          locale: input.payload.locale ?? null,
        });

  return createHash('sha256').update(rawCandidate).digest('hex');
}

function coerceTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

async function safeSelectOne<T extends Record<string, unknown>>(
  pool: Pool,
  query: string,
  params: unknown[],
): Promise<T | null> {
  const result = await pool.query(query, params);
  return (result.rows[0] as T | undefined) ?? null;
}

function resolveTraceFullFlag(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function stageAtLeast(current: TraceStage, minimum: TraceStage): boolean {
  const rank: Record<TraceStage, number> = {
    output: 0,
    context: 1,
    llm: 2,
    persist: 3,
  };
  return rank[current] >= rank[minimum];
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const traceSource = resolveTraceSource(process.env.TRACE_SOURCE);

  if (
    traceSource === 'whatsapp' &&
    (!process.env.WHATSAPP_SECRET || process.env.WHATSAPP_SECRET.trim().length === 0)
  ) {
    process.env.WHATSAPP_SECRET = 'trace-whatsapp-secret';
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validate: validateEnv,
      }),
    ],
    providers: [
      SignatureValidationService,
      TurnstileVerificationService,
      InputValidationService,
      ExtractVariablesService,
      TextSanitizer,
      IntentExtractorAdapter,
      EnrichContextByIntentUseCase,
      EntelequiaHttpAdapter,
      OpenAiAdapter,
      PromptTemplatesAdapter,
      PgPoolProvider,
      pgPoolFactory,
      PgIdempotencyRepository,
      PgChatRepository,
      PgAuditRepository,
      {
        provide: ENTELEQUIA_CONTEXT_PORT,
        useExisting: EntelequiaHttpAdapter,
      },
      {
        provide: PROMPT_TEMPLATES_PORT,
        useExisting: PromptTemplatesAdapter,
      },
      {
        provide: METRICS_PORT,
        useValue: {
          incrementMessage: () => undefined,
          observeResponseLatency: () => undefined,
          incrementFallback: () => undefined,
          incrementStockExactDisclosure: () => undefined,
        },
      },
    ],
  }).compile();

  const signatureValidation = moduleRef.get(SignatureValidationService);
  const inputValidation = moduleRef.get(InputValidationService);
  const extractVariables = moduleRef.get(ExtractVariablesService);
  const textSanitizer = moduleRef.get(TextSanitizer);
  const intentExtractor = moduleRef.get(IntentExtractorAdapter);
  const enrichContextByIntent = moduleRef.get(EnrichContextByIntentUseCase);
  const llmAdapter = moduleRef.get(OpenAiAdapter);
  const promptTemplates = moduleRef.get(PromptTemplatesAdapter);
  const idempotencyRepository = moduleRef.get(PgIdempotencyRepository);
  const chatRepository = moduleRef.get(PgChatRepository);
  const auditRepository = moduleRef.get(PgAuditRepository);
  const pool = moduleRef.get<Pool>(PG_POOL);

  const requestId = `trace-${randomUUID()}`;
  const traceStage = resolveTraceStage(process.env.TRACE_STAGE);
  const traceFull = resolveTraceFullFlag(process.env.TRACE_FULL) || traceStage !== 'output';

  const traceUserId = process.env.TRACE_USER_ID?.trim();
  const traceConversationId = process.env.TRACE_CONVERSATION_ID?.trim();
  const traceText = process.env.TRACE_TEXT?.trim();

  const inboundBody = {
    source: traceSource,
    userId: traceUserId && traceUserId.length > 0 ? traceUserId : `trace-web-user-${randomUUID()}`,
    conversationId:
      traceConversationId && traceConversationId.length > 0
        ? traceConversationId
        : `trace-conv-${randomUUID()}`,
    text:
      traceText && traceText.length > 0
        ? traceText
        : 'Hola, tienen manga Nro 1 de Attack on Titan?',
  } satisfies PlainObject;

  const rawBody = JSON.stringify(inboundBody);
  const requestHeaders: Record<string, string> = {};
  if (traceSource === 'whatsapp') {
    requestHeaders['x-hub-signature-256'] = buildWhatsappSignature({
      rawBody,
      secret: String(process.env.WHATSAPP_SECRET ?? ''),
    });
  }
  const traceExternalEventId = process.env.TRACE_EXTERNAL_EVENT_ID?.trim();
  const request = buildTraceRequest({
    headers: requestHeaders,
    externalEventId:
      traceExternalEventId && traceExternalEventId.length > 0 ? traceExternalEventId : undefined,
    body: inboundBody,
    rawBody,
  });

  const signatureOutput = await signatureValidation.validateRequest(request);
  const inputValidated = inputValidation.validate(signatureOutput);
  const extracted = extractVariables.extract(inputValidated);

  const canonicalPayload = {
    source: String(extracted.source ?? ''),
    userId: String(extracted.userId ?? ''),
    conversationId: String(extracted.conversationId ?? ''),
    text: String(extracted.text ?? ''),
  };

  const sanitizedText = textSanitizer.sanitize(canonicalPayload.text);

  if (canonicalPayload.source !== 'web' && canonicalPayload.source !== 'whatsapp') {
    throw new Error(`Invalid source for trace run: ${canonicalPayload.source}`);
  }

  const externalEventId = computeExternalEventId({ request, payload: canonicalPayload });

  const idempotencyStart = await idempotencyRepository.startProcessing({
    source: canonicalPayload.source,
    externalEventId,
    payload: extracted,
    requestId,
  });

  const externalEventRowRaw = await safeSelectOne<Record<string, unknown>>(
    pool,
    `SELECT id, status, received_at, created_at, processed_at, error
     FROM external_events
     WHERE source = $1 AND external_event_id = $2`,
    [canonicalPayload.source, externalEventId],
  );
  const externalEventRow = externalEventRowRaw
    ? {
        id: String(externalEventRowRaw.id),
        status: String(externalEventRowRaw.status),
        received_at: coerceTimestamp(externalEventRowRaw.received_at),
        created_at: coerceTimestamp(externalEventRowRaw.created_at),
        processed_at:
          externalEventRowRaw.processed_at === null ||
          externalEventRowRaw.processed_at === undefined
            ? null
            : coerceTimestamp(externalEventRowRaw.processed_at),
        error:
          externalEventRowRaw.error === null || externalEventRowRaw.error === undefined
            ? null
            : String(externalEventRowRaw.error),
      }
    : null;

  const userContext = await chatRepository.upsertUser(canonicalPayload.userId);
  await chatRepository.upsertConversation({
    conversationId: canonicalPayload.conversationId,
    userId: canonicalPayload.userId,
    channel: canonicalPayload.source,
  });

  const conversationContext = prepareConversationQuery(extracted, userContext);
  const conversationHistoryRows = await chatRepository.getConversationHistoryRows({
    conversationId: canonicalPayload.conversationId,
    limit: 10,
  });

  const intentResult = await intentExtractor.extractIntent({
    text: sanitizedText,
    requestId,
    source: canonicalPayload.source,
    userId: canonicalPayload.userId,
    conversationId: canonicalPayload.conversationId,
  });

  const outputValidated = validateAndEnrichIntentOutput({
    originalText: sanitizedText,
    intentResult,
  });

  const enrichedData = { ...conversationContext, ...outputValidated };

  const history = mapConversationHistoryRowsToMessageHistoryItems(conversationHistoryRows);

  let downstream:
    | {
        intentRouted: string;
        contextBlocks: ContextBlock[] | null;
        assistantReply: string | null;
        response: Wf1Response;
      }
    | null = null;

  if (traceFull && idempotencyStart.isDuplicate === false) {
    const routedIntent = resolveIntentRoute(outputValidated.intent);
    const routedIntentResult = { ...outputValidated, intent: routedIntent };

    let contextBlocks: ContextBlock[] | null = null;
    let assistantReply: string | null = null;
    let response: Wf1Response;

    try {
      if (stageAtLeast(traceStage, 'context')) {
        contextBlocks = await enrichContextByIntent.execute({
          intentResult: routedIntentResult,
          text: sanitizedText,
        });

        contextBlocks = appendStaticContextBlock(contextBlocks, promptTemplates.getStaticContext());
      }

      if (stageAtLeast(traceStage, 'llm')) {
        const llmReply = await llmAdapter.buildAssistantReply({
          requestId,
          conversationId: canonicalPayload.conversationId,
          externalEventId,
          userText: sanitizedText,
          intent: routedIntent,
          history,
          contextBlocks: contextBlocks ?? [],
        });
        assistantReply = typeof llmReply === 'string' ? llmReply : llmReply.message;
      }

      response = {
        ok: true,
        message: assistantReply ?? '(TRACE) Skipped LLM stage',
        conversationId: canonicalPayload.conversationId,
        intent: routedIntent,
      };
    } catch (error: unknown) {
      response = mapContextOrBackendError(error);
    }

    if (stageAtLeast(traceStage, 'persist')) {
      await chatRepository.persistTurn({
        conversationId: canonicalPayload.conversationId,
        userId: canonicalPayload.userId,
        source: canonicalPayload.source,
        externalEventId,
        userMessage: sanitizedText,
        botMessage: response.message,
        intent: response.ok ? (response.intent ?? 'general') : 'error',
        metadata: {
          requiresAuth: response.ok === false && 'requiresAuth' in response,
          predictedIntent: routedIntent,
          predictedConfidence: outputValidated.confidence,
          predictedEntitiesCount: outputValidated.entities.length,
          sentiment: outputValidated.sentiment,
        },
      });

      await idempotencyRepository.markProcessed({
        source: canonicalPayload.source,
        externalEventId,
      });

      await auditRepository.writeAudit({
        requestId,
        userId: canonicalPayload.userId,
        conversationId: canonicalPayload.conversationId,
        source: canonicalPayload.source,
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
          externalEventId,
          predictedIntent: routedIntent,
          predictedConfidence: outputValidated.confidence,
          predictedEntitiesCount: outputValidated.entities.length,
          sentiment: outputValidated.sentiment,
          responseType:
            response.ok === true
              ? 'success'
              : response.ok === false && 'requiresAuth' in response
                ? 'requiresAuth'
                : 'failure',
        },
      });
    }

    downstream = {
      intentRouted: routedIntent,
      contextBlocks,
      assistantReply,
      response,
    };
  }

  const trace = {
    requestId,
    traceFull,
    traceStage,
    inbound: {
      headers: Object.entries({
        'x-hub-signature-256': request.header('x-hub-signature-256'),
        'x-external-event-id': request.header('x-external-event-id'),
      }).reduce<Record<string, unknown>>((acc, [name, value]) => {
        if (typeof value === 'string' && value.length > 0) {
          acc[name] = name === 'x-external-event-id' ? value : redact(value);
        }
        return acc;
      }, {}),
      rawBody,
      body: inboundBody,
    },
    signatureValidation: signatureOutput,
    inputValidation: inputValidated,
    extractVariables: extracted,
    computed: {
      externalEventId,
      sanitizedText,
      idempotency: {
        isDuplicate: idempotencyStart.isDuplicate,
        externalEvent: externalEventRow,
      },
    },
    userContext,
    prepareConversationQuery: conversationContext,
    conversationHistory: {
      rows: conversationHistoryRows,
      items: history,
    },
    extractIntent: intentResult,
    outputValidation: outputValidated,
    downstream,
    enrichedDataKeys: Object.keys(enrichedData),
  };

  process.stdout.write(JSON.stringify(trace, null, 2) + '\n');
  await moduleRef.close();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`TRACE FAILED: ${message}\n`);
  if (error instanceof Error && error.stack) {
    process.stderr.write(error.stack + '\n');
  }
  process.exitCode = 1;
});
