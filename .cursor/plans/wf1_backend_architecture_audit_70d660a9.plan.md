---
name: WF1 Backend Architecture Audit
overview: Comprehensive architecture audit of the Entelequia WF1 chatbot backend (NestJS + TypeScript), covering Clean Architecture alignment, NestJS best practices, TypeScript safety, DRY, security, testing, and modern chatbot patterns.
todos:
  - id: fix-self-pool
    content: "BLOCKER: Fix self.pool -> this.pool in pg-wf1.repository.ts:228 markProcessed()"
    status: pending
  - id: fix-console-error
    content: Replace console.error with NestJS Logger in signature-validation.service.ts
    status: pending
  - id: add-rate-limiting
    content: Add @nestjs/throttler for rate limiting on chat endpoint
    status: pending
  - id: extract-duplicated-helpers
    content: Extract resolveOptionalString() and ensureObject() to common/utils/
    status: pending
  - id: add-helmet
    content: Add helmet middleware for security headers
    status: pending
  - id: fix-clean-arch-boundary
    content: Move TextSanitizer to domain, MissingAuthForOrdersError to domain/errors/
    status: pending
  - id: resolve-dto-strategy
    content: Strip class-validator decorators from ChatRequestDto or switch controller to @Body()
    status: pending
  - id: add-retry-openai
    content: Extract shared retry utility and apply to OpenAiAdapter
    status: pending
  - id: split-repository
    content: Split PgWf1Repository into focused repositories per port
    status: pending
  - id: add-missing-tests
    content: Add unit tests for TextSanitizer, EnrichContextByIntent, OpenAiAdapter, EntelequiaHttpAdapter
    status: pending
isProject: false
---

# WF1 Backend Architecture Audit

---

## A) Executive Summary

- **Blocker bug in production path**: `[pg-wf1.repository.ts:228](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)` uses `self.pool` instead of `this.pool` in `markProcessed()`. In Node.js `self === globalThis`, so this always throws at runtime, causing every successfully-processed message to fall into the catch block and return a failure response to the user. Turns are persisted but users receive errors, audit logs record "failure," and events are never marked "processed."
- **Clean Architecture is well-intentioned and ~80% correct**: ports/adapters pattern with Symbol tokens is solid. Two boundary violations exist (use-case imports `TextSanitizer` from infrastructure; `MissingAuthForOrdersError` defined in a use-case file instead of domain).
- **NestJS patterns are sound**: module boundaries, DI with port tokens, guards pipeline, global filters, and CORS are properly configured. Missing: rate limiting, Helmet, proper migration tooling.
- **TypeScript strict mode is enabled with good discipline**: `no-explicit-any` ESLint rule enforced. A few `Record<string, unknown>` escape hatches remain in `express.d.ts` augmentation and port signatures.
- **Security posture is above average for early-stage**: timing-safe HMAC, input sanitization, request size limits, CORS whitelist, webhook signature validation. Gaps: no rate limiting, `console.error` leaking to stdout in signature service, no Helmet headers.
- **Testing pyramid is promising but incomplete**: strong unit tests for security services, integration test for the main use case, e2e with mocked infrastructure. Missing: unit tests for adapters, text-sanitizer, enrich-context use case; no contract tests for Entelequia API.
- **ChatRequestDto validators are dead code**: the main endpoint uses `@Req()` with guard-based validation, so class-validator decorators on `ChatRequestDto` never execute.
- **DRY violations**: `resolveOptionalString()` duplicated across 2 controllers; `ensureObject()` duplicated across 3 files.
- **No observability stack**: no structured tracing, no correlation ID propagation beyond `requestId`, no metrics endpoint.
- **Overall maturity score: 6/10** -- solid foundation with correct instincts, but the blocker bug, missing rate limiting, and incomplete test coverage prevent a higher rating.

---

## B) Architecture Map

### Current Module/Layer Structure

```
AppModule
  |-- HealthModule
  |     |-- HealthController (GET /health)
  |
  |-- Wf1Module
        |-- Controllers
        |     |-- ChatController (POST /wf1/chat/message)
        |     |-- IntentController (POST /api/v1/chat/intent)
        |
        |-- Guards (request pipeline)
        |     |-- SignatureGuard -> SignatureValidationService
        |     |-- InputValidationGuard -> InputValidationService
        |     |-- ExtractVariablesGuard -> ExtractVariablesService
        |
        |-- Application Layer (use-cases + ports)
        |     |-- HandleIncomingMessageUseCase
        |     |-- EnrichContextByIntentUseCase
        |     |-- Ports: IntentExtractor, LLM, ChatPersistence, Idempotency, Audit, EntelequiaContext
        |
        |-- Infrastructure Layer
        |     |-- IntentExtractorAdapter (OpenAI Responses API - gpt-4o-mini)
        |     |-- OpenAiAdapter (OpenAI Responses API - gpt-4.1-mini)
        |     |-- EntelequiaHttpAdapter (Entelequia REST API)
        |     |-- PgWf1Repository (PostgreSQL - implements 3 ports)
        |     |-- TextSanitizer
        |
        |-- Domain
        |     |-- Wf1Response (discriminated union)
        |     |-- Intent types
        |     |-- ContextBlock, MessageHistoryItem
        |     |-- ChannelSource
        |     |-- TextPolicy constants
        |
        |-- DTOs
              |-- ChatRequestDto (class-validator - UNUSED by validation pipe)
              |-- ChatResponseDto (UNUSED anywhere)
```

### Request Flow (POST /wf1/chat/message)

```
HTTP Request
  -> express json middleware (raw body capture)
  -> requestIdMiddleware (X-Request-ID)
  -> SignatureGuard (validates HMAC / webhook secret)
  -> InputValidationGuard (validates source, text, limits)
  -> ExtractVariablesGuard (whitelists fields)
  -> ChatController.handleMessage()
      -> resolvePayload() (manual DTO construction from req.extractedVariables)
      -> resolveExternalEventId() (header or SHA-256 hash)
      -> HandleIncomingMessageUseCase.execute()
          -> idempotencyPort.startProcessing()
          -> chatPersistence.upsertUser/upsertConversation
          -> chatPersistence.getConversationHistory()
          -> intentExtractor.extractIntent()
          -> enrichContextByIntent.execute() (Entelequia API calls)
          -> llmPort.buildAssistantReply() (OpenAI)
          -> chatPersistence.persistTurn()
          -> idempotencyPort.markProcessed() // BUG: self.pool
          -> auditPort.writeAudit()
  -> HttpExceptionFilter (global catch)
```

### Target Architecture (Clean Architecture Aligned)

The current structure is close. The target adjustments are:

1. Move `TextSanitizer` from infrastructure to domain (or create a domain service port).
2. Move `MissingAuthForOrdersError` and `EntelequiaApiError` to `domain/errors/`.
3. Split `PgWf1Repository` into focused repositories per port or at minimum per bounded context.
4. Remove dead DTOs or rewire the controller to use `@Body()` with the ValidationPipe.
5. Extract shared helpers (`ensureObject`, `resolveOptionalString`) into `common/utils/`.

---

## C) Findings Table

| Severity    | Area                        | Finding                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                                                                                               | Recommendation                                                                                                                                                              | Effort | Expected Impact                                                                  |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| **Blocker** | NestJS / Clean Architecture | `markProcessed()` uses `self.pool` instead of `this.pool`, causing all successful requests to throw and return failure responses                                         | `[pg-wf1.repository.ts:228](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)` `await self.pool.query(...)`                                                                                                                                                                                            | Change `self.pool` to `this.pool`                                                                                                                                           | S      | Fixes production-breaking bug; users will receive correct responses              |
| **High**    | Clean Architecture          | Use case imports infrastructure class `TextSanitizer` directly, violating the dependency rule                                                                            | `[handle-incoming-message.use-case.ts:22](src/modules/wf1/application/use-cases/handle-incoming-message.use-case.ts)` imports from `../../infrastructure/security/text-sanitizer`                                                                                                                                      | Create a `TextSanitizerPort` interface in `application/ports/` and inject via token, or move `TextSanitizer` to domain layer as a pure function                             | S      | Restores Clean Architecture boundary; allows swapping sanitizer in tests         |
| **High**    | Clean Architecture          | `MissingAuthForOrdersError` is defined in a use-case file but represents a domain concept                                                                                | `[enrich-context-by-intent.use-case.ts:9-14](src/modules/wf1/application/use-cases/enrich-context-by-intent.use-case.ts)`                                                                                                                                                                                              | Move to `domain/errors/missing-auth.error.ts`                                                                                                                               | S      | Cleaner domain modeling and reuse across use cases                               |
| **High**    | Clean Architecture          | `EntelequiaApiError` (a concrete class with `statusCode`, `errorCode`) is defined inside a port interface file, making the application layer aware of HTTP-level details | `[entelequia-context.port.ts:3-13](src/modules/wf1/application/ports/entelequia-context.port.ts)`                                                                                                                                                                                                                      | Move to `domain/errors/` as a domain error or keep in the port file but rename to a domain concept (e.g., `ExternalServiceError`) decoupled from HTTP semantics             | M      | Ports remain pure interfaces; error handling in use case becomes domain-oriented |
| **High**    | NestJS                      | `ChatRequestDto` class-validator decorators are dead code -- the main endpoint uses `@Req()` with guard-based validation, so the ValidationPipe never processes this DTO | `[chat.controller.ts:28](src/modules/wf1/controllers/chat.controller.ts)` uses `@Req()` not `@Body(ChatRequestDto)`; `[chat-request.dto.ts](src/modules/wf1/dto/chat-request.dto.ts)` has unused decorators                                                                                                            | Either switch to `@Body()` with proper DTO validation (removing guard-based duplication), or strip class-validator decorators and use `ChatRequestDto` as a plain interface | M      | Removes misleading code; clarifies validation strategy                           |
| **High**    | NestJS                      | `PgWf1Repository` implements 3 ports (`ChatPersistence`, `Idempotency`, `Audit`) in a 313-line god object                                                                | `[pg-wf1.repository.ts](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)`                                                                                                                                                                                                                             | Split into `PgChatRepository`, `PgIdempotencyRepository`, `PgAuditRepository` sharing a common `PgPoolProvider`                                                             | M      | SRP compliance; easier testing and maintenance                                   |
| **High**    | Security                    | No rate limiting on any endpoint                                                                                                                                         | No `@nestjs/throttler` or equivalent in `[package.json](package.json)` or `[wf1.module.ts](src/modules/wf1/wf1.module.ts)`                                                                                                                                                                                             | Add `@nestjs/throttler` with per-IP and per-userId limits                                                                                                                   | S      | Prevents abuse and protects downstream OpenAI/Entelequia APIs                    |
| **Medium**  | NestJS                      | `ChatResponseDto` classes are completely unused                                                                                                                          | `[chat-response.dto.ts](src/modules/wf1/dto/chat-response.dto.ts)` -- not imported anywhere else in codebase                                                                                                                                                                                                           | Either use them for Swagger/OpenAPI documentation or delete them                                                                                                            | S      | Reduces dead code                                                                |
| **Medium**  | Security                    | `console.error` used for logging in `SignatureValidationService` instead of NestJS `Logger`                                                                              | `[signature-validation.service.ts:42](src/modules/wf1/infrastructure/security/signature-validation.service.ts)` `console.error('Signature validation failed:', message)`                                                                                                                                               | Replace with `this.logger.error(...)` using `@nestjs/common` Logger                                                                                                         | S      | Structured logging; consistent with rest of codebase                             |
| **Medium**  | DRY                         | `resolveOptionalString()` duplicated in two controllers                                                                                                                  | `[chat.controller.ts:103-110](src/modules/wf1/controllers/chat.controller.ts)` and `[intent.controller.ts:44-51](src/modules/wf1/controllers/intent.controller.ts)`                                                                                                                                                    | Extract to `common/utils/string.utils.ts`                                                                                                                                   | S      | DRY compliance                                                                   |
| **Medium**  | DRY                         | `ensureObject()` duplicated in 3 files with identical logic                                                                                                              | `[input-validation.service.ts:100-106](src/modules/wf1/infrastructure/security/input-validation.service.ts)`, `[extract-variables.service.ts:33-39](src/modules/wf1/infrastructure/security/extract-variables.service.ts)`, `[intent.validator.ts:70-76](src/modules/wf1/infrastructure/adapters/intent.validator.ts)` | Extract to `common/utils/object.utils.ts`                                                                                                                                   | S      | DRY compliance                                                                   |
| **Medium**  | Chatbot Patterns            | `OpenAiAdapter.buildAssistantReply()` has no retry/backoff logic, unlike `IntentExtractorAdapter` which has proper retry                                                 | `[openai.adapter.ts:45-86](src/modules/wf1/infrastructure/adapters/openai.adapter.ts)` vs `[intent-extractor.adapter.ts](src/modules/wf1/infrastructure/adapters/intent-extractor.adapter.ts)`                                                                                                                         | Add retry with exponential backoff mirroring intent extractor pattern, or extract a shared `OpenAiRetryClient`                                                              | M      | Reduces transient failures in LLM responses                                      |
| **Medium**  | Chatbot Patterns            | System prompt for assistant replies is hardcoded inline in `buildPrompt()`                                                                                               | `[openai.adapter.ts:95-104](src/modules/wf1/infrastructure/adapters/openai.adapter.ts)`                                                                                                                                                                                                                                | Load from a versioned file like intent prompt, or use a prompt template system                                                                                              | S      | Versioning, auditability, easier prompt iteration                                |
| **Medium**  | Chatbot Patterns            | No caching for Entelequia API responses (products, recommendations, payment info)                                                                                        | All calls in `[entelequia-http.adapter.ts](src/modules/wf1/infrastructure/adapters/entelequia-http.adapter.ts)` are direct `fetch()` with no cache                                                                                                                                                                     | Add in-memory TTL cache (e.g., `@nestjs/cache-manager`) for public/non-auth endpoints                                                                                       | M      | Reduces latency and external API load                                            |
| **Medium**  | NestJS                      | Guard chain uses mutable `request` object as implicit data bus between guards                                                                                            | `[signature.guard.ts:13](src/modules/wf1/infrastructure/security/signature.guard.ts)` writes to `request.signatureValidation`; `[input-validation.guard.ts:14](src/modules/wf1/infrastructure/security/input-validation.guard.ts)` reads it                                                                            | Consider consolidating into a single `RequestPipelineGuard` or using NestJS interceptors with proper typing                                                                 | L      | Reduces implicit coupling; explicit data flow                                    |
| **Medium**  | TypeScript                  | `express.d.ts` augmentations use `& Record<string, unknown>` on `signatureValidation` and `inputValidation`, defeating type safety                                       | `[express.d.ts:8](src/common/types/express.d.ts)`                                                                                                                                                                                                                                                                      | Remove `& Record<string, unknown>` and define precise types matching service outputs                                                                                        | S      | Stronger compile-time checks                                                     |
| **Medium**  | NestJS                      | `ensureAuditTable()` in `onModuleInit()` creates DDL at application startup                                                                                              | `[pg-wf1.repository.ts:34-37](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)`                                                                                                                                                                                                                       | Remove runtime DDL; rely solely on SQL migration scripts (already exist in `sql/`)                                                                                          | S      | Cleaner separation of concerns; predictable deployments                          |
| **Medium**  | Chatbot Patterns            | No circuit breaker for external API calls (Entelequia, OpenAI)                                                                                                           | `[entelequia-http.adapter.ts](src/modules/wf1/infrastructure/adapters/entelequia-http.adapter.ts)` and `[openai.adapter.ts](src/modules/wf1/infrastructure/adapters/openai.adapter.ts)`                                                                                                                                | Implement circuit breaker pattern (e.g., `cockatiel` library) wrapping fetch calls                                                                                          | M      | Prevents cascade failures when downstream is degraded                            |
| **Medium**  | Security                    | No `helmet` middleware for HTTP security headers                                                                                                                         | Not present in `[package.json](package.json)` or `[main.ts](src/main.ts)`                                                                                                                                                                                                                                              | Add `@nestjs/helmet` for standard security headers (X-Frame-Options, HSTS, etc.)                                                                                            | S      | Defense in depth                                                                 |
| **Low**     | Testing                     | No unit tests for `TextSanitizer`, `OpenAiAdapter`, `EntelequiaHttpAdapter`, or `EnrichContextByIntentUseCase`                                                           | Only tests exist: `signature-validation.service.spec.ts`, `input-validation.service.spec.ts`, `extract-variables.service.spec.ts`, `intent-extractor.adapter.spec.ts`, `intent.validator.spec.ts`, `handle-incoming-message.integration.spec.ts`                                                                       | Add unit tests for each untested class, prioritizing `EnrichContextByIntentUseCase` (business logic) and `TextSanitizer` (security)                                         | M      | Higher confidence in business logic correctness                                  |
| **Low**     | Testing                     | No contract/schema tests for Entelequia API responses                                                                                                                    | `[entelequia-http.adapter.ts](src/modules/wf1/infrastructure/adapters/entelequia-http.adapter.ts)` treats responses as `Record<string, unknown>`                                                                                                                                                                       | Add contract tests validating expected response shapes from Entelequia endpoints                                                                                            | M      | Catches API contract drift early                                                 |
| **Low**     | Observability               | No structured tracing, metrics, or analytics integration                                                                                                                 | No tracing library in `[package.json](package.json)`                                                                                                                                                                                                                                                                   | Add OpenTelemetry or similar for distributed tracing; expose `/metrics` for Prometheus                                                                                      | L      | Production visibility                                                            |
| **Low**     | NestJS                      | No `nest-cli.json` configuration file                                                                                                                                    | Missing from repository root                                                                                                                                                                                                                                                                                           | Add for consistent `nest build` and generator settings                                                                                                                      | S      | Standard NestJS project structure                                                |
| **Low**     | Chatbot Patterns            | No outbox worker implementation; `outbox_messages` are inserted but never consumed                                                                                       | `[pg-wf1.repository.ts:161-176](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)` inserts WhatsApp outbox rows                                                                                                                                                                                        | Implement a scheduled worker (NestJS `@Cron` or separate process) to poll and deliver outbox messages                                                                       | L      | Completes WhatsApp delivery pipeline                                             |
| **Low**     | DRY                         | Duplicate text length constants: `MAX_MESSAGE_LENGTH = 4096` in `InputValidationService` vs `WF1_MAX_TEXT_CHARS = 4096` in `text-policy.ts`                              | `[input-validation.service.ts:4](src/modules/wf1/infrastructure/security/input-validation.service.ts)` vs `[text-policy.ts:1](src/modules/wf1/domain/text-policy.ts)`                                                                                                                                                  | Use `WF1_MAX_TEXT_CHARS` from domain in both places                                                                                                                         | S      | Single source of truth for limits                                                |

---

## D) Top 10 Prioritized Actions

### Quick Wins (S effort, immediate value)

1. **Fix `self.pool` bug in `markProcessed()**`-- Change`self.pool`to`this.pool`in`[pg-wf1.repository.ts:228](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)`. This is a production-breaking bug.
2. **Replace `console.error` with NestJS Logger** in `[signature-validation.service.ts:42](src/modules/wf1/infrastructure/security/signature-validation.service.ts)`. One-line fix for structured logging.
3. **Add rate limiting** -- `npm install @nestjs/throttler`, add `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] })` to `Wf1Module`, apply `@UseGuards(ThrottlerGuard)` to chat endpoint.
4. **Extract duplicated helpers** -- Move `resolveOptionalString()` and `ensureObject()` to `src/common/utils/` and import from there.
5. **Add Helmet** -- `npm install helmet`, add `app.use(helmet())` in `main.ts` after `app.use(json(...))`.

### Structural Refactors (M-L effort, architectural improvement)

1. **Fix Clean Architecture boundary for TextSanitizer** -- Move `TextSanitizer` to `domain/` as a pure utility (it has no dependencies), or create a port interface. Also move `MissingAuthForOrdersError` to `domain/errors/`.
2. **Resolve DTO validation strategy** -- Either (a) make `ChatController` use `@Body(ChatRequestDto)` and remove guard-based validation, or (b) strip class-validator decorators from `ChatRequestDto` and convert it to a plain TypeScript interface. Option (b) is lower risk since the guard chain is well-tested.
3. **Add retry/backoff to `OpenAiAdapter**`-- Extract the retry logic from`IntentExtractorAdapter`into a shared utility (e.g.,`withRetry(fn, opts)`) and apply to both adapters.
4. **Split `PgWf1Repository**`-- Extract into`PgChatRepository`, `PgIdempotencyRepository`, `PgAuditRepository`sharing a`PG_POOL`provider. Remove`ensureAuditTable()`from`onModuleInit()`.
5. **Add missing unit tests** -- Priority order: `TextSanitizer` (security), `EnrichContextByIntentUseCase` (business logic), `OpenAiAdapter` (fallback behavior), `EntelequiaHttpAdapter` (error mapping).

---

## E) Proposed Target Folder Structure

```
src/
  common/
    config/
      env.validation.ts
    filters/
      http-exception.filter.ts
    middleware/
      request-id.middleware.ts
    types/
      express.d.ts
    utils/                              # NEW: shared pure utilities
      string.utils.ts                   # resolveOptionalString, etc.
      object.utils.ts                   # ensureObject
  modules/
    health/
      health.controller.ts
      health.module.ts
    wf1/
      domain/
        errors/                         # NEW: domain error classes
          missing-auth.error.ts         # from enrich-context use case
          external-service.error.ts     # from entelequia-context port
        context-block.ts
        intent.ts
        source.ts
        text-policy.ts
        text-sanitizer.ts              # MOVED from infrastructure (pure function, no deps)
        wf1-response.ts
      application/
        ports/
          audit.port.ts
          chat-persistence.port.ts
          entelequia-context.port.ts    # interface only, no error classes
          idempotency.port.ts
          intent-extractor.port.ts
          llm.port.ts
          tokens.ts
        use-cases/
          handle-incoming-message.use-case.ts
          enrich-context-by-intent.use-case.ts
      infrastructure/
        adapters/
          entelequia-http.adapter.ts
          intent-extractor.adapter.ts
          intent.validator.ts
          openai.adapter.ts
          openai-retry.client.ts        # NEW: shared retry logic
        repositories/
          pg-pool.provider.ts           # NEW: shared Pool token
          pg-chat.repository.ts         # split from pg-wf1
          pg-idempotency.repository.ts  # split from pg-wf1
          pg-audit.repository.ts        # split from pg-wf1
        security/
          signature.guard.ts
          signature-validation.service.ts
          input-validation.guard.ts
          input-validation.service.ts
          extract-variables.guard.ts
          extract-variables.service.ts
      controllers/
        chat.controller.ts
        intent.controller.ts
      dto/
        chat-request.dto.ts            # converted to plain interface
      wf1.module.ts
```

**Migration approach**: incremental, no big-bang. Each numbered action above can be a separate PR. Start with actions 1-5 (quick wins in a single PR), then 6-10 as individual PRs.

---

## F) Code Examples

### Example 1: Fixing the `self.pool` blocker

In `[pg-wf1.repository.ts](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)`, line 228:

```typescript
// BEFORE (broken):
async markProcessed(input: { source: ChannelSource; externalEventId: string }): Promise<void> {
    await self.pool.query( // self === globalThis, not this instance
      `UPDATE external_events ...`,
      [input.source, input.externalEventId],
    );
}

// AFTER (fixed):
async markProcessed(input: { source: ChannelSource; externalEventId: string }): Promise<void> {
    await this.pool.query(
      `UPDATE external_events
       SET status = 'processed', processed_at = now(), error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE source = $1 AND external_event_id = $2`,
      [input.source, input.externalEventId],
    );
}
```

### Example 2: Shared retry utility for OpenAI adapters

```typescript
// src/modules/wf1/infrastructure/adapters/openai-retry.client.ts

export interface RetryOptions {
  maxAttempts: number;
  baseBackoffMs: number;
  shouldRetry: (error: unknown) => boolean;
  onAttemptFailed?: (error: unknown, attempt: number, retrying: boolean) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const canRetry = options.shouldRetry(error) && attempt < options.maxAttempts;
      options.onAttemptFailed?.(error, attempt, canRetry);

      if (!canRetry) break;

      const delay = options.baseBackoffMs * 2 ** (attempt - 1);
      const jitter = delay * (Math.random() * 0.4 - 0.2);
      await new Promise((r) => setTimeout(r, Math.max(0, Math.round(delay + jitter))));
    }
  }

  throw lastError;
}
```

### Example 3: TextSanitizer as a domain pure function

```typescript
// src/modules/wf1/domain/text-sanitizer.ts

/** Pure domain utility -- no framework dependencies */
export function sanitizeText(rawText: string): string {
  if (typeof rawText !== "string") return "";

  return rawText
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

If NestJS DI is still desired, wrap it in an injectable that delegates to the pure function, keeping the domain function framework-free.

---

## G) Questions / Unknowns

1. **Is the `self.pool` bug known?** If this code has been deployed, all successful message processing would return failure responses. This suggests either (a) it hasn't been deployed yet, or (b) there is a test gap that missed it. The e2e test mocks `PgWf1Repository` entirely, so it wouldn't catch this.
2. **Is there a plan for the outbox worker?** The schema and repository insert outbox rows for WhatsApp, but no consumer exists. Is this deferred or handled by another service?
3. **What is the expected traffic volume?** This determines urgency of rate limiting, caching, and connection pool tuning (currently `max: 10`).
4. **Is there a CI/CD pipeline?** No `Dockerfile`, no `.github/workflows/`, no deployment config visible. The audit assumes these are external or pending.
