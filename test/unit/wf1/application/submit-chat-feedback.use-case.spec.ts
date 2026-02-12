import { BadRequestException } from '@nestjs/common';
import type { AuditPort } from '@/modules/wf1/application/ports/audit.port';
import type { ChatFeedbackPort } from '@/modules/wf1/application/ports/chat-feedback.port';
import type { MetricsPort } from '@/modules/wf1/application/ports/metrics.port';
import { SubmitChatFeedbackUseCase } from '@/modules/wf1/application/use-cases/submit-chat-feedback/submit-chat-feedback.use-case';

describe('SubmitChatFeedbackUseCase', () => {
  function buildSubject(deps?: {
    chatFeedbackPort?: Partial<ChatFeedbackPort>;
    auditPort?: Partial<AuditPort>;
    metricsPort?: Partial<MetricsPort>;
  }): {
    useCase: SubmitChatFeedbackUseCase;
    chatFeedbackPort: ChatFeedbackPort;
    auditPort: AuditPort;
    metricsPort: MetricsPort;
  } {
    const chatFeedbackPort: ChatFeedbackPort = {
      persistFeedback: jest.fn().mockResolvedValue({ created: true }),
      ...deps?.chatFeedbackPort,
    };
    const auditPort: AuditPort = {
      writeAudit: jest.fn().mockResolvedValue(undefined),
      ...deps?.auditPort,
    };
    const metricsPort = {
      incrementFeedbackReceived: jest.fn(),
    } as unknown as MetricsPort;

    Object.assign(metricsPort, deps?.metricsPort ?? {});

    return {
      useCase: new SubmitChatFeedbackUseCase(
        chatFeedbackPort,
        auditPort,
        metricsPort,
      ),
      chatFeedbackPort,
      auditPort,
      metricsPort,
    };
  }

  it('records feedback and audits success', async () => {
    const { useCase, chatFeedbackPort, auditPort, metricsPort } = buildSubject();

    await expect(
      useCase.execute({
        requestId: 'req-1',
        externalEventId: 'evt-1',
        userId: 'guest-1',
        clientIp: '127.0.0.1',
        payload: {
          source: 'web',
          conversationId: 'conv-1',
          responseId: 'cfd8ca60-5e3e-423e-971f-be2a95224553',
          rating: 'down',
          category: 'accuracy',
          reason: 'No fue util',
        },
      }),
    ).resolves.toEqual({ ok: true });

    expect(chatFeedbackPort.persistFeedback).toHaveBeenCalledTimes(1);
    expect(metricsPort.incrementFeedbackReceived).toHaveBeenCalledWith('down');
    expect(auditPort.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'feedback',
        status: 'success',
      }),
    );
  });

  it('writes duplicate audit when idempotent feedback already exists', async () => {
    const { useCase, auditPort } = buildSubject({
      chatFeedbackPort: {
        persistFeedback: jest.fn().mockResolvedValue({ created: false }),
      },
    });

    await useCase.execute({
      requestId: 'req-2',
      externalEventId: 'evt-2',
      payload: {
        source: 'web',
        conversationId: 'conv-1',
        responseId: '6f2e6b9b-8374-44bb-8e9f-d3e4fdb7f01f',
        rating: 'up',
      },
    });

    expect(auditPort.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'feedback_duplicate',
      }),
    );
  });

  it('maps invalid target errors to BadRequestException', async () => {
    const { useCase } = buildSubject({
      chatFeedbackPort: {
        persistFeedback: jest
          .fn()
          .mockRejectedValue(new Error('FEEDBACK_TARGET_NOT_FOUND')),
      },
    });

    await expect(
      useCase.execute({
        requestId: 'req-3',
        externalEventId: 'evt-3',
        payload: {
          source: 'web',
          conversationId: 'conv-1',
          responseId: '2e0ec46e-46bc-4f2e-a4de-f55815753d03',
          rating: 'up',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
