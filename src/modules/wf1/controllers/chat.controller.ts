import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { HandleIncomingMessageUseCase } from '../application/use-cases/handle-incoming-message.use-case';
import { ChatRequestDto } from '../dto/chat-request.dto';
import type { Wf1Response } from '../domain/wf1-response';
import { SignatureGuard } from '../infrastructure/security/signature.guard';

@Controller()
export class ChatController {
  constructor(private readonly handleIncomingMessage: HandleIncomingMessageUseCase) {}

  @Post('wf1/chat/message')
  @HttpCode(200)
  @UseGuards(SignatureGuard)
  async handleMessage(@Body() payload: ChatRequestDto, @Req() request: Request): Promise<Wf1Response> {
    const requestId = request.requestId ?? randomUUID();
    const externalEventId = this.resolveExternalEventId(request, payload);

    return this.handleIncomingMessage.execute({
      requestId,
      externalEventId,
      payload,
    });
  }

  private resolveExternalEventId(request: Request, payload: ChatRequestDto): string {
    const explicitHeader = request.header('x-external-event-id') ?? request.header('x-idempotency-key');

    if (explicitHeader && explicitHeader.trim().length > 0) {
      return explicitHeader.trim().slice(0, 255);
    }

    const requestId = request.requestId ?? randomUUID();

    const rawCandidate = request.rawBody && request.rawBody.trim().length > 0
      ? request.rawBody
      : JSON.stringify({
          source: payload.source,
          userId: payload.userId,
          conversationId: payload.conversationId,
          text: payload.text,
          requestId,
        });

    return createHash('sha256').update(rawCandidate).digest('hex');
  }
}
