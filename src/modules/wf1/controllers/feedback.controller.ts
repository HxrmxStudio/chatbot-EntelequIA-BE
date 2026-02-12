import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { resolveOptionalString } from '../../../common/utils/string.utils';
import { ChatFeedbackRequestDto } from '../dto/chat-feedback-request.dto';
import {
  SubmitChatFeedbackUseCase,
  type SubmitChatFeedbackResponse,
} from '../application/use-cases/submit-chat-feedback/submit-chat-feedback.use-case';

@Controller()
export class FeedbackController {
  constructor(private readonly submitChatFeedback: SubmitChatFeedbackUseCase) {}

  @Post('wf1/chat/feedback')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async submitFeedback(
    @Req() request: Request,
    @Body() payload: ChatFeedbackRequestDto,
  ): Promise<SubmitChatFeedbackResponse> {
    const requestId = request.requestId ?? randomUUID();
    const externalEventId = this.resolveExternalEventId(request, payload);
    const clientIp = resolveClientIp(request);

    return this.submitChatFeedback.execute({
      requestId,
      externalEventId,
      payload,
      userId: resolveOptionalString(request.header('x-user-id')),
      clientIp,
    });
  }

  private resolveExternalEventId(
    request: Request,
    payload: ChatFeedbackRequestDto,
  ): string {
    const explicitHeader =
      request.header('x-external-event-id') ?? request.header('x-idempotency-key');

    if (explicitHeader && explicitHeader.trim().length > 0) {
      return explicitHeader.trim().slice(0, 255);
    }

    const rawCandidate =
      request.rawBody && request.rawBody.trim().length > 0
        ? request.rawBody
        : JSON.stringify({
            source: payload.source,
            conversationId: payload.conversationId,
            responseId: payload.responseId,
            rating: payload.rating,
            category: payload.category ?? null,
          });

    return createHash('sha256').update(rawCandidate).digest('hex');
  }
}

function resolveClientIp(request: Request): string | undefined {
  const forwarded = request.header('x-forwarded-for');
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.trim();
  }

  if (Array.isArray(request.ips) && request.ips.length > 0) {
    const first = request.ips[0]?.trim();
    if (first) {
      return first;
    }
  }

  if (typeof request.ip === 'string' && request.ip.trim().length > 0) {
    return request.ip.trim();
  }

  const remoteAddress = request.socket?.remoteAddress?.trim();
  return remoteAddress && remoteAddress.length > 0 ? remoteAddress : undefined;
}
