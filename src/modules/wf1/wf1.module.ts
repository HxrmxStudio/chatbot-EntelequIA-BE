import { Module } from '@nestjs/common';
import { ChatController } from './controllers/chat.controller';
import { IntentController } from './controllers/intent.controller';
import {
  AUDIT_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
} from './application/ports/tokens';
import { EnrichContextByIntentUseCase } from './application/use-cases/enrich-context-by-intent';
import { HandleIncomingMessageUseCase } from './application/use-cases/handle-incoming-message';
import { EntelequiaHttpAdapter } from './infrastructure/adapters/entelequia-http';
import { IntentExtractorAdapter } from './infrastructure/adapters/intent-extractor';
import { OpenAiAdapter } from './infrastructure/adapters/openai';
import {
  pgPoolFactory,
  PgPoolProvider,
} from './infrastructure/repositories/pg-pool.provider';
import { PgAuditRepository } from './infrastructure/repositories/pg-audit.repository';
import { PgChatRepository } from './infrastructure/repositories/pg-chat.repository';
import { PgIdempotencyRepository } from './infrastructure/repositories/pg-idempotency.repository';
import { ExtractVariablesGuard } from './infrastructure/security/extract-variables.guard';
import { ExtractVariablesService } from './infrastructure/security/extract-variables';
import { InputValidationGuard } from './infrastructure/security/input-validation.guard';
import { InputValidationService } from './infrastructure/security/input-validation';
import { SignatureGuard } from './infrastructure/security/signature.guard';
import { SignatureValidationService } from './infrastructure/security/signature-validation';
import { TextSanitizer } from './infrastructure/security/text-sanitizer';
import { TurnstileVerificationService } from './infrastructure/security/turnstile-verification';

@Module({
  controllers: [ChatController, IntentController],
  providers: [
    SignatureGuard,
    InputValidationGuard,
    ExtractVariablesGuard,
    SignatureValidationService,
    TurnstileVerificationService,
    InputValidationService,
    ExtractVariablesService,
    TextSanitizer,
    EnrichContextByIntentUseCase,
    HandleIncomingMessageUseCase,
    IntentExtractorAdapter,
    EntelequiaHttpAdapter,
    OpenAiAdapter,
    PgPoolProvider,
    pgPoolFactory,
    PgChatRepository,
    PgIdempotencyRepository,
    PgAuditRepository,
    {
      provide: INTENT_EXTRACTOR_PORT,
      useExisting: IntentExtractorAdapter,
    },
    {
      provide: ENTELEQUIA_CONTEXT_PORT,
      useExisting: EntelequiaHttpAdapter,
    },
    {
      provide: LLM_PORT,
      useExisting: OpenAiAdapter,
    },
    {
      provide: CHAT_PERSISTENCE_PORT,
      useExisting: PgChatRepository,
    },
    {
      provide: IDEMPOTENCY_PORT,
      useExisting: PgIdempotencyRepository,
    },
    {
      provide: AUDIT_PORT,
      useExisting: PgAuditRepository,
    },
  ],
})
export class Wf1Module {}
