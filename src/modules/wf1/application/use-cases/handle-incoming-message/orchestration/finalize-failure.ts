import type { Logger } from '@/common/utils/logger';
import type { AuditPort } from '@/modules/wf1/application/ports/audit.port';
import type { IdempotencyPort } from '@/modules/wf1/application/ports/idempotency.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import type { ChatRequestDto } from '@/modules/wf1/dto/chat-request.dto';
import type { Wf1Response } from '@/modules/wf1/domain/wf1-response';
import { BACKEND_ERROR_MESSAGE } from '../support/error-mapper';
import { LLM_PATH_FALLBACK_DEFAULT } from '../support/constants';

export async function finalizeFailure(input: {
  error: unknown;
  requestId: string;
  externalEventId: string;
  payload: ChatRequestDto;
  startedAt: number;
  logger: Pick<Logger, 'error' | 'info'>;
  idempotencyPort: IdempotencyPort;
  auditPort: AuditPort;
  metricsPort: MetricsPort;
}): Promise<Wf1Response> {
  input.logger.error('WF1 processing failed', input.error instanceof Error ? input.error : undefined, {
    requestId: input.requestId,
  });

  const fallbackResponse: Wf1Response = {
    ok: false,
    message: BACKEND_ERROR_MESSAGE,
  };

  await input.idempotencyPort.markFailed({
    source: input.payload.source,
    externalEventId: input.externalEventId,
    errorMessage: input.error instanceof Error ? input.error.message : 'Unknown error',
  });

  await input.auditPort.writeAudit({
    requestId: input.requestId,
    userId: input.payload.userId,
    conversationId: input.payload.conversationId,
    source: input.payload.source,
    intent: 'error',
    status: 'failure',
    message: fallbackResponse.message,
    httpStatus: 200,
    latencyMs: Date.now() - input.startedAt,
    errorCode: input.error instanceof Error ? input.error.name : 'UnknownError',
    metadata: {
      externalEventId: input.externalEventId,
    },
  });

  input.logger.info('final_stage_audited', {
    event: 'final_stage_audited',
    request_id: input.requestId,
    conversation_id: input.payload.conversationId,
    intent: 'error',
    source: input.payload.source,
    status: 'failure',
    latency_ms: Date.now() - input.startedAt,
  });

  input.metricsPort.incrementMessage({
    source: input.payload.source,
    intent: 'error',
    llmPath: LLM_PATH_FALLBACK_DEFAULT,
  });
  input.metricsPort.observeResponseLatency({
    intent: 'error',
    seconds: (Date.now() - input.startedAt) / 1000,
  });
  input.metricsPort.incrementFallback('unknown');

  return fallbackResponse;
}
