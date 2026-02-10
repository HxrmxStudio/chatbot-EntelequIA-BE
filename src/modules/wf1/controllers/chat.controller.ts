import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { resolveOptionalString } from '../../../common/utils/string.utils';
import { HandleIncomingMessageUseCase } from '../application/use-cases/handle-incoming-message';
import { ChatRequestDto } from '../dto/chat-request.dto';
import type { Wf1Response } from '../domain/wf1-response';
import { ExtractVariablesGuard } from '../infrastructure/security/extract-variables.guard';
import { InputValidationGuard } from '../infrastructure/security/input-validation.guard';
import { SignatureGuard } from '../infrastructure/security/signature.guard';

@Controller()
export class ChatController {
  constructor(private readonly handleIncomingMessage: HandleIncomingMessageUseCase) {}

  @Post('wf1/chat/message')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, SignatureGuard, InputValidationGuard, ExtractVariablesGuard)
  async handleMessage(@Req() request: Request): Promise<Wf1Response> {
    const payload = this.resolvePayload(
      request.extractedVariables,
      request.inputValidation,
    );
    const requestId = request.requestId ?? randomUUID();
    const externalEventId = this.resolveExternalEventId(request, payload);

    return this.handleIncomingMessage.execute({
      requestId,
      externalEventId,
      payload,
      idempotencyPayload: request.extractedVariables ?? {},
    });
  }

  private resolvePayload(
    extracted: Request['extractedVariables'],
    validated: Request['inputValidation'],
  ): ChatRequestDto {
    if (!extracted) {
      throw new BadRequestException('Invalid payload');
    }

    const source = resolveSource(extracted.source);
    const userId = resolveRequiredStringField('userId', extracted.userId);
    const conversationId = resolveRequiredStringField(
      'conversationId',
      extracted.conversationId,
    );
    const text = resolveRequiredStringField('text', extracted.text);

    const accessToken = resolveOptionalString(validated?.accessToken);
    const locale = resolveOptionalString(validated?.locale);
    const currency = resolveCurrency(validated?.currency);

    return {
      source,
      userId,
      conversationId,
      text,
      accessToken,
      currency,
      locale,
    };
  }

  private resolveExternalEventId(request: Request, payload: ChatRequestDto): string {
    const explicitHeader = request.header('x-external-event-id') ?? request.header('x-idempotency-key');

    if (explicitHeader && explicitHeader.trim().length > 0) {
      return explicitHeader.trim().slice(0, 255);
    }

    const rawCandidate = request.rawBody && request.rawBody.trim().length > 0
      ? request.rawBody
      : JSON.stringify({
          source: payload.source,
          userId: payload.userId,
          conversationId: payload.conversationId,
          text: payload.text,
          currency: payload.currency ?? null,
          locale: payload.locale ?? null,
        });

    return createHash('sha256').update(rawCandidate).digest('hex');
  }
}

function resolveCurrency(value: unknown): 'ARS' | 'USD' | undefined {
  return value === 'ARS' || value === 'USD' ? value : undefined;
}

function resolveRequiredStringField(fieldName: string, value: string | null): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`Invalid ${fieldName}: must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException(`Invalid ${fieldName}: must be a string`);
  }

  return trimmed;
}

function resolveSource(value: string | null): 'web' | 'whatsapp' {
  if (value === 'web' || value === 'whatsapp') {
    return value;
  }

  throw new BadRequestException('Invalid source: must be web or whatsapp');
}
