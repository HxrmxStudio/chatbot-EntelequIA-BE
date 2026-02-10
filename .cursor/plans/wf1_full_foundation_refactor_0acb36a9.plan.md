---
name: WF1 Full Foundation Refactor
overview: 'Implement all audit findings: fix blocker bug, restructure to Clean Architecture, add rate limiting/helmet/retry, split god repository, extract shared utilities, generate CI/CD pipeline, create best practices documentation, and add missing tests.'
todos:
  - id: p1-fix-self-pool
    content: 'Phase 1: Fix self.pool blocker bug'
    status: completed
  - id: p1-fix-console-error
    content: 'Phase 1: Replace console.error with Logger'
    status: completed
  - id: p1-fix-express-types
    content: 'Phase 1: Tighten express.d.ts types'
    status: completed
  - id: p1-extract-helpers
    content: 'Phase 1: Extract shared utils (resolveOptionalString, ensureObject)'
    status: completed
  - id: p1-unify-constants
    content: 'Phase 1: Unify text length constants'
    status: completed
  - id: p2-domain-errors
    content: 'Phase 2: Create domain/errors/ with MissingAuthError, ExternalServiceError'
    status: completed
  - id: p2-move-sanitizer
    content: 'Phase 2: Move TextSanitizer to domain as pure function'
    status: completed
  - id: p2-update-imports
    content: 'Phase 2: Update all imports across codebase'
    status: completed
  - id: p3-pg-pool-provider
    content: 'Phase 3: Create PG_POOL provider and factory'
    status: completed
  - id: p3-split-repos
    content: 'Phase 3: Split into PgChat, PgIdempotency, PgAudit repositories'
    status: completed
  - id: p3-update-module
    content: 'Phase 3: Update wf1.module.ts bindings'
    status: completed
  - id: p4-dto-cleanup
    content: 'Phase 4: Convert ChatRequestDto to interface, delete ChatResponseDto'
    status: completed
  - id: p5-retry-utility
    content: 'Phase 5: Create shared withRetry() and apply to both OpenAI adapters'
    status: completed
  - id: p5-externalize-prompt
    content: 'Phase 5: Externalize assistant system prompt to file'
    status: completed
  - id: p5-rate-limit-helmet
    content: 'Phase 5: Install and configure throttler + helmet'
    status: completed
  - id: p5-nest-cli
    content: 'Phase 5: Add nest-cli.json'
    status: completed
  - id: p6-docker
    content: 'Phase 6: Create Dockerfile, docker-compose.yml, .dockerignore'
    status: completed
  - id: p6-github-ci
    content: 'Phase 6: Create .github/workflows/ci.yml'
    status: completed
  - id: p7-best-practices
    content: 'Phase 7: Create BEST_PRACTICES.md and cursor rule'
    status: completed
  - id: p8-tests
    content: 'Phase 8: Add missing unit tests for all untested components'
    status: completed
isProject: false
---

# WF1 Full Foundation Refactor

## Phase 1: Critical Fixes and Shared Utilities (no structural changes)

- Fix `self.pool` -> `this.pool` blocker in `[pg-wf1.repository.ts:228](src/modules/wf1/infrastructure/repositories/pg-wf1.repository.ts)`
- Replace `console.error` with NestJS `Logger` in `[signature-validation.service.ts](src/modules/wf1/infrastructure/security/signature-validation.service.ts)`
- Tighten `express.d.ts` types: remove `& Record<string, unknown>` escape hatches
- Extract `resolveOptionalString()` to `src/common/utils/string.utils.ts`
- Extract `ensureObject()` to `src/common/utils/object.utils.ts`
- Unify text length constant: use `WF1_MAX_TEXT_CHARS` from `text-policy.ts` in `input-validation.service.ts`

## Phase 2: Domain Layer Restructure

- Create `src/modules/wf1/domain/errors/` directory
- Move `MissingAuthForOrdersError` -> `domain/errors/missing-auth.error.ts`
- Move `EntelequiaApiError` -> `domain/errors/external-service.error.ts` (rename to `ExternalServiceError`)
- Move `TextSanitizer` to `domain/text-sanitizer.ts` as a pure function (no `@Injectable`)
- Create lightweight injectable wrapper in infrastructure for DI compatibility
- Update all imports across use-cases, adapters, ports

## Phase 3: Split PgWf1Repository

- Create `PG_POOL` provider token in `[tokens.ts](src/modules/wf1/application/ports/tokens.ts)`
- Create `PgPoolProvider` factory in `infrastructure/repositories/pg-pool.provider.ts`
- Split into `PgChatRepository` (ChatPersistencePort)
- Split into `PgIdempotencyRepository` (IdempotencyPort)
- Split into `PgAuditRepository` (AuditPort) -- remove `ensureAuditTable()` DDL
- Update `[wf1.module.ts](src/modules/wf1/wf1.module.ts)` provider bindings
- Delete old `pg-wf1.repository.ts`

## Phase 4: DTO and Controller Cleanup

- Convert `ChatRequestDto` to plain interface (strip class-validator decorators)
- Delete unused `ChatResponseDto` file
- Clean up controller: keep guard-based validation as the canonical path

## Phase 5: Infrastructure Hardening

- Create shared `withRetry()` utility in `infrastructure/adapters/openai-retry.client.ts`
- Refactor `IntentExtractorAdapter` to use shared retry
- Add retry/backoff to `OpenAiAdapter`
- Externalize assistant system prompt to `prompts/entelequia_assistant_system_prompt_v1.txt`
- Install and configure `@nestjs/throttler` (30 req/min per IP)
- Install and configure `helmet` in `main.ts`
- Add `nest-cli.json`

## Phase 6: CI/CD Pipeline

- Create `Dockerfile` (multi-stage: build + production)
- Create `docker-compose.yml` (app + postgres for local dev)
- Create `.github/workflows/ci.yml` (lint, test, build)
- Create `.dockerignore`

## Phase 7: Best Practices Documentation

- Create `.cursor/rules/refactored-architecture.mdc` with layer boundaries, naming conventions, and patterns
- Create `docs/BEST_PRACTICES.md` for the team: Clean Code, Clean Architecture, NestJS patterns, TypeScript patterns, testing strategy

## Phase 8: Add Missing Tests

- Unit test for `sanitizeText` (domain pure function)
- Unit test for `EnrichContextByIntentUseCase`
- Unit test for `OpenAiAdapter` (retry, fallback, timeout)
- Unit test for `EntelequiaHttpAdapter` (error mapping)
- Update existing integration test for split repositories
- Update e2e test for new provider structure
