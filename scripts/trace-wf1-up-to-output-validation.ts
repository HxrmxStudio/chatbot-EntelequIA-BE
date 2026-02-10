import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { Request } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { validateEnv } from '../src/common/config/env.validation';
import { SignatureValidationService } from '../src/modules/wf1/infrastructure/security/signature-validation';
import { TurnstileVerificationService } from '../src/modules/wf1/infrastructure/security/turnstile-verification';
import { InputValidationService } from '../src/modules/wf1/infrastructure/security/input-validation';
import { ExtractVariablesService } from '../src/modules/wf1/infrastructure/security/extract-variables';
import { TextSanitizer } from '../src/modules/wf1/infrastructure/security/text-sanitizer';
import { IntentExtractorAdapter } from '../src/modules/wf1/infrastructure/adapters/intent-extractor';
import { prepareConversationQuery } from '../src/modules/wf1/domain/prepare-conversation-query';
import { validateAndEnrichIntentOutput } from '../src/modules/wf1/domain/output-validation';
import { PG_POOL } from '../src/modules/wf1/application/ports/tokens';
import {
  PgPoolProvider,
  pgPoolFactory,
} from '../src/modules/wf1/infrastructure/repositories/pg-pool.provider';
import { PgIdempotencyRepository } from '../src/modules/wf1/infrastructure/repositories/pg-idempotency.repository';
import { PgChatRepository } from '../src/modules/wf1/infrastructure/repositories/pg-chat.repository';

type PlainObject = Record<string, unknown>;

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length === 0 ? '' : '<redacted>';
  }
  return '<redacted>';
}

function buildWebRequest(input: {
  webhookSecret: string;
  externalEventId?: string;
  body: PlainObject;
  rawBody: string;
}): Request {
  const headers = new Map<string, string>();
  headers.set('x-webhook-secret', input.webhookSecret);
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

function computeExternalEventId(input: { request: Request; payload: PlainObject }): string {
  const explicitHeader =
    input.request.header('x-external-event-id') ?? input.request.header('x-idempotency-key');

  if (explicitHeader && explicitHeader.trim().length > 0) {
    return explicitHeader.trim().slice(0, 255);
  }

  const rawBody = typeof input.request.body === 'string' ? input.request.body : '';
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

async function main(): Promise<void> {
  // Provide a safe default for local trace runs.
  // Real deployments should set WEBHOOK_SECRET explicitly.
  if (!process.env.WEBHOOK_SECRET || process.env.WEBHOOK_SECRET.trim().length === 0) {
    process.env.WEBHOOK_SECRET = 'trace-secret';
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
      PgPoolProvider,
      pgPoolFactory,
      PgIdempotencyRepository,
      PgChatRepository,
    ],
  }).compile();

  const signatureValidation = moduleRef.get(SignatureValidationService);
  const inputValidation = moduleRef.get(InputValidationService);
  const extractVariables = moduleRef.get(ExtractVariablesService);
  const textSanitizer = moduleRef.get(TextSanitizer);
  const intentExtractor = moduleRef.get(IntentExtractorAdapter);
  const idempotencyRepository = moduleRef.get(PgIdempotencyRepository);
  const chatRepository = moduleRef.get(PgChatRepository);
  const pool = moduleRef.get<Pool>(PG_POOL);

  const requestId = `trace-${randomUUID()}`;

  const traceUserId = process.env.TRACE_USER_ID?.trim();
  const traceConversationId = process.env.TRACE_CONVERSATION_ID?.trim();
  const traceText = process.env.TRACE_TEXT?.trim();

  const inboundBody = {
    source: 'web',
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

  const webSecret = String(process.env.WEBHOOK_SECRET ?? '');
  const rawBody = JSON.stringify(inboundBody);
  const traceExternalEventId = process.env.TRACE_EXTERNAL_EVENT_ID?.trim();
  const request = buildWebRequest({
    webhookSecret: webSecret,
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

  const trace = {
    requestId,
    inbound: {
      headers: {
        'x-webhook-secret': redact(webSecret),
        ...(request.header('x-external-event-id')
          ? { 'x-external-event-id': request.header('x-external-event-id') }
          : {}),
      },
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
    },
    extractIntent: intentResult,
    outputValidation: outputValidated,
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
