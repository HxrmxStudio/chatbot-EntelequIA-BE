import { Module } from '@nestjs/common';
import { ChatController } from './controllers/chat.controller';
import { FeedbackController } from './controllers/feedback.controller';
import { IntentController } from './controllers/intent.controller';
import { MetricsController } from './controllers/metrics.controller';
import {
  ADAPTIVE_EXEMPLARS_PORT,
  AUDIT_PORT,
  CHAT_FEEDBACK_PORT,
  CHAT_PERSISTENCE_PORT,
  ENTELEQUIA_CONTEXT_PORT,
  IDEMPOTENCY_PORT,
  INTENT_EXTRACTOR_PORT,
  LLM_PORT,
  METRICS_PORT,
  ORDER_LOOKUP_PORT,
  ORDER_LOOKUP_RATE_LIMITER_PORT,
  PROMPT_TEMPLATES_PORT,
} from './application/ports/tokens';
import { EnrichContextByIntentUseCase } from './application/use-cases/enrich-context-by-intent';
import { HandleIncomingMessageUseCase } from './application/use-cases/handle-incoming-message';
import { SubmitChatFeedbackUseCase } from './application/use-cases/submit-chat-feedback/submit-chat-feedback.use-case';
import {
  BotHmacSigner,
  EntelequiaHttpAdapter,
  EntelequiaOrderLookupClient,
} from './infrastructure/adapters/entelequia-http';
import { IntentExtractorAdapter } from './infrastructure/adapters/intent-extractor';
import { PrometheusMetricsAdapter } from './infrastructure/adapters/metrics/prometheus-metrics.adapter';
import { OpenAiAdapter } from './infrastructure/adapters/openai';
import { PromptTemplatesAdapter } from './infrastructure/adapters/prompt-templates';
import { RedisOrderLookupRateLimiterAdapter } from './infrastructure/adapters/rate-limit';
import {
  pgPoolFactory,
  PgPoolProvider,
} from './infrastructure/repositories/pg-pool.provider';
import { PgAuditRepository } from './infrastructure/repositories/pg-audit.repository';
import { PgAdaptiveExemplarsRepository } from './infrastructure/repositories/pg-adaptive-exemplars.repository';
import { PgChatRepository } from './infrastructure/repositories/pg-chat.repository';
import { PgChatFeedbackRepository } from './infrastructure/repositories/pg-chat-feedback.repository';
import { PgIdempotencyRepository } from './infrastructure/repositories/pg-idempotency.repository';
import { ExtractVariablesGuard } from './infrastructure/security/extract-variables.guard';
import { ExtractVariablesService } from './infrastructure/security/services/extract-variables';
import { InputValidationGuard } from './infrastructure/security/input-validation.guard';
import { InputValidationService } from './infrastructure/security/services/input-validation';
import { SignatureGuard } from './infrastructure/security/signature.guard';
import { SignatureValidationService } from './infrastructure/security/services/signature-validation';
import { TurnstileVerificationService } from './infrastructure/security/services/turnstile-verification';

@Module({
  controllers: [ChatController, FeedbackController, IntentController, MetricsController],
  providers: [
    SignatureGuard,
    InputValidationGuard,
    ExtractVariablesGuard,
    SignatureValidationService,
    TurnstileVerificationService,
    InputValidationService,
    ExtractVariablesService,
    EnrichContextByIntentUseCase,
    HandleIncomingMessageUseCase,
    SubmitChatFeedbackUseCase,
    IntentExtractorAdapter,
    BotHmacSigner,
    EntelequiaOrderLookupClient,
    EntelequiaHttpAdapter,
    RedisOrderLookupRateLimiterAdapter,
    PrometheusMetricsAdapter,
    OpenAiAdapter,
    PromptTemplatesAdapter,
    PgPoolProvider,
    pgPoolFactory,
    PgChatRepository,
    PgChatFeedbackRepository,
    PgAdaptiveExemplarsRepository,
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
      provide: PROMPT_TEMPLATES_PORT,
      useExisting: PromptTemplatesAdapter,
    },
    {
      provide: METRICS_PORT,
      useExisting: PrometheusMetricsAdapter,
    },
    {
      provide: ORDER_LOOKUP_PORT,
      useExisting: EntelequiaOrderLookupClient,
    },
    {
      provide: ORDER_LOOKUP_RATE_LIMITER_PORT,
      useExisting: RedisOrderLookupRateLimiterAdapter,
    },
    {
      provide: CHAT_PERSISTENCE_PORT,
      useExisting: PgChatRepository,
    },
    {
      provide: CHAT_FEEDBACK_PORT,
      useExisting: PgChatFeedbackRepository,
    },
    {
      provide: ADAPTIVE_EXEMPLARS_PORT,
      useExisting: PgAdaptiveExemplarsRepository,
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
