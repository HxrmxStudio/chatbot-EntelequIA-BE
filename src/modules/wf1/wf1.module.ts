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
import { EnrichContextByIntentUseCase } from './application/use-cases/enrich-context-by-intent.use-case';
import { HandleIncomingMessageUseCase } from './application/use-cases/handle-incoming-message.use-case';
import { EntelequiaHttpAdapter } from './infrastructure/adapters/entelequia-http.adapter';
import { IntentExtractorAdapter } from './infrastructure/adapters/intent-extractor.adapter';
import { OpenAiAdapter } from './infrastructure/adapters/openai.adapter';
import { PgWf1Repository } from './infrastructure/repositories/pg-wf1.repository';
import { SignatureGuard } from './infrastructure/security/signature.guard';
import { TextSanitizer } from './infrastructure/security/text-sanitizer';

@Module({
  controllers: [ChatController, IntentController],
  providers: [
    SignatureGuard,
    TextSanitizer,
    EnrichContextByIntentUseCase,
    HandleIncomingMessageUseCase,
    IntentExtractorAdapter,
    EntelequiaHttpAdapter,
    OpenAiAdapter,
    PgWf1Repository,
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
      useExisting: PgWf1Repository,
    },
    {
      provide: IDEMPOTENCY_PORT,
      useExisting: PgWf1Repository,
    },
    {
      provide: AUDIT_PORT,
      useExisting: PgWf1Repository,
    },
  ],
})
export class Wf1Module {}
