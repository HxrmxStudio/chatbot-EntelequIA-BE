import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { INTENT_EXTRACTOR_PORT } from '../application/ports/tokens';
import type { IntentExtractorPort } from '../application/ports/intent-extractor.port';
import type { IntentResult } from '../domain/intent';

@Controller('api/v1/chat')
export class IntentController {
  constructor(
    @Inject(INTENT_EXTRACTOR_PORT)
    private readonly intentExtractor: IntentExtractorPort,
  ) {}

  @Post('intent')
  @HttpCode(200)
  async classifyIntent(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<IntentResult> {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length === 0) {
      throw new UnprocessableEntityException('Payload invalido.');
    }

    return this.intentExtractor.extractIntent({
      text,
      requestId: request.requestId ?? randomUUID(),
      source: resolveOptionalString(body.source),
      userId: resolveOptionalString(body.userId),
      conversationId: resolveOptionalString(body.conversationId),
    });
  }
}

function resolveOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
