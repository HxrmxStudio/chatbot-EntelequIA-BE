import type { AuditPort } from '@/modules/wf1/application/ports/audit.port';
import type { ChatPersistencePort } from '@/modules/wf1/application/ports/chat-persistence.port';
import type { IdempotencyPort } from '@/modules/wf1/application/ports/idempotency.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import type { ChatRequestDto } from '@/modules/wf1/dto/chat-request.dto';
import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import { isCatalogUiMetadata } from '../support/handle-incoming-message.helpers';

export async function handleDuplicateEvent(input: {
  requestId: string;
  externalEventId: string;
  payload: ChatRequestDto;
  idempotencyPayload: Record<string, unknown>;
  startedAt: number;
  idempotencyPort: IdempotencyPort;
  chatPersistence: ChatPersistencePort;
  auditPort: AuditPort;
  metricsPort: MetricsPort;
}): Promise<Wf1Response | null> {
  const idempotency = await input.idempotencyPort.startProcessing({
    source: input.payload.source,
    externalEventId: input.externalEventId,
    payload: input.idempotencyPayload,
    requestId: input.requestId,
  });

  if (!idempotency.isDuplicate) {
    return null;
  }

  const previous = await input.chatPersistence.getLastBotTurnByExternalEvent({
    channel: input.payload.source,
    externalEventId: input.externalEventId,
  });

  if (isCatalogUiMetadata(previous?.metadata)) {
    input.metricsPort.incrementUiPayloadSuppressed('duplicate');
  }

  const duplicateResponse: Wf1Response = {
    ok: true,
    message: previous?.message ?? 'Este mensaje ya fue procesado.',
    conversationId: input.payload.conversationId,
    ...(previous ? { responseId: previous.messageId } : {}),
  };

  await input.auditPort.writeAudit({
    requestId: input.requestId,
    userId: input.payload.userId,
    conversationId: input.payload.conversationId,
    source: input.payload.source,
    intent: 'duplicate',
    status: 'duplicate',
    message: duplicateResponse.message,
    httpStatus: 200,
    latencyMs: Date.now() - input.startedAt,
    metadata: {
      externalEventId: input.externalEventId,
    },
  });

  return duplicateResponse;
}
