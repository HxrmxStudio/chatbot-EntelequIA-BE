import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AuditPort } from '../../ports/audit.port';
import type { ChatFeedbackPort } from '../../ports/chat-feedback.port';
import type { MetricsPort } from '../../ports/metrics.port';
import { AUDIT_PORT, CHAT_FEEDBACK_PORT, METRICS_PORT } from '../../ports/tokens';
import type { ChatFeedbackRequestDto } from '../../../dto/chat-feedback-request.dto';

export interface SubmitChatFeedbackResponse {
  ok: true;
}

@Injectable()
export class SubmitChatFeedbackUseCase {
  constructor(
    @Inject(CHAT_FEEDBACK_PORT)
    private readonly chatFeedbackPort: ChatFeedbackPort,
    @Inject(AUDIT_PORT)
    private readonly auditPort: AuditPort,
    @Inject(METRICS_PORT)
    private readonly metricsPort: MetricsPort,
  ) {}

  async execute(input: {
    requestId: string;
    externalEventId: string;
    payload: ChatFeedbackRequestDto;
    userId?: string;
    clientIp?: string;
  }): Promise<SubmitChatFeedbackResponse> {
    const startedAt = Date.now();

    try {
      const persisted = await this.chatFeedbackPort.persistFeedback({
        source: input.payload.source,
        conversationId: input.payload.conversationId,
        responseId: input.payload.responseId,
        userId: input.userId,
        rating: input.payload.rating,
        reason: input.payload.reason,
        category: input.payload.category,
        externalEventId: input.externalEventId,
        requestId: input.requestId,
        metadata: {
          clientIp: input.clientIp ?? null,
        },
      });

      this.metricsPort.incrementFeedbackReceived(input.payload.rating);

      await this.auditPort.writeAudit({
        requestId: input.requestId,
        userId: input.userId ?? 'guest',
        conversationId: input.payload.conversationId,
        source: input.payload.source,
        intent: 'feedback',
        status: 'success',
        message: persisted.created ? 'feedback_recorded' : 'feedback_duplicate',
        httpStatus: 200,
        latencyMs: Date.now() - startedAt,
        metadata: {
          externalEventId: input.externalEventId,
          responseId: input.payload.responseId,
          rating: input.payload.rating,
          category: input.payload.category ?? null,
          created: persisted.created,
        },
      });

      return { ok: true };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message === 'FEEDBACK_TARGET_NOT_FOUND' ||
          error.message === 'FEEDBACK_CONVERSATION_MISMATCH')
      ) {
        throw new BadRequestException('responseId invalido para esa conversacion.');
      }

      throw error;
    }
  }
}
