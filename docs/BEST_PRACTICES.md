# Best Practices - Chatbot WF1 Backend

This document defines coding standards, architecture patterns, and conventions for the Entelequia chatbot backend. Follow these when writing or reviewing code.

---

## 1. Clean Architecture

### Layer Boundaries

```
Controllers (HTTP) → Use Cases → Ports (interfaces) ← Adapters (implementations)
                     ↑
                   Domain (entities, errors, pure functions)
```

- **Domain**: Pure business logic, no framework imports. Define entities, errors, and value objects.
- **Application (Use Cases)**: Orchestrate domain and ports. Inject ports via tokens. No direct infrastructure imports.
- **Infrastructure**: Implement ports. Can depend on domain and application. Contains adapters, repositories, security.
- **Controllers**: Thin layer. Map HTTP to use-case input, use-case output to HTTP.

### Dependency Rule

Dependencies point **inward**: Domain has no dependencies. Use cases depend only on ports. Infrastructure implements ports.

### Ports and Adapters

- Define **ports** (interfaces) in `application/ports/`.
- Use **Symbol tokens** for DI: `export const LLM_PORT = Symbol('LLM_PORT')`.
- Implement ports in `infrastructure/adapters/` or `infrastructure/repositories/`.
- Register bindings in the module: `{ provide: LLM_PORT, useExisting: OpenAiAdapter }`.

---

## 2. NestJS Patterns

### Modules

- One module per bounded context (e.g. `Wf1Module`).
- Modules should be cohesive and loosely coupled.
- Avoid circular dependencies. Use forwardRef only when necessary.

### Controllers

- Keep controllers thin. Delegate to use cases.
- Use guards for auth, validation, and security.
- Use `@UseGuards()` in order: ThrottlerGuard → SignatureGuard → ValidationGuard.
- Return domain types or DTOs that match the API contract.

### Providers

- Prefer `useExisting` for port bindings to avoid duplicate instances.
- Use `useFactory` for configurable providers (e.g. PG_POOL).
- Implement `OnModuleDestroy` for resources that need cleanup (e.g. DB pool).

### Error Handling

- Use domain errors for business exceptions (e.g. `MissingAuthForOrdersError`).
- Use NestJS exceptions for HTTP layer (e.g. `BadRequestException`, `UnauthorizedException`).
- Global `HttpExceptionFilter` maps exceptions to consistent JSON responses.

---

## 3. TypeScript

### Strictness

- `strict: true`, `noImplicitAny: true` in tsconfig.
- ESLint: `@typescript-eslint/no-explicit-any: error`.

### Types

- Prefer `interface` over `type` for object shapes.
- Use `type` for unions, branded types, and utility types.
- Avoid `any`. Use `unknown` and narrow with type guards.
- Define DTOs as interfaces when not using class-validator decorators.

### Naming

- PascalCase for classes, interfaces, types.
- camelCase for variables, functions, methods.
- Suffix ports with `Port`: `LlmPort`, `ChatPersistencePort`.
- Suffix adapters with `Adapter` or `Repository`: `OpenAiAdapter`, `PgChatRepository`.

---

## 4. DRY and Maintainability

### Shared Utilities

- Extract repeated logic to `src/common/utils/`.
- Examples: `resolveOptionalString`, `ensureObject`, `withRetry`.
- Keep utilities pure and framework-agnostic when possible.

### Constants

- Single source of truth for limits (e.g. `WF1_MAX_TEXT_CHARS` in `domain/text-policy.ts`).
- Do not duplicate magic numbers. Use named constants.

### Domain Errors

- Define in `domain/errors/`.
- Export via `domain/errors/index.ts`.
- Use for use-case error handling and adapter error mapping.

---

## 5. Security

- **Input validation**: Use guards and semantic validation. Whitelist fields.
- **Secrets**: Never hardcode. Use env vars and `.env.example` for documentation.
- **Logging**: Use NestJS `Logger`. Never log PII, tokens, or raw request bodies.
- **Rate limiting**: Apply `ThrottlerGuard` to chat and intent endpoints.
- **Headers**: Use `helmet` for security headers.
- **CORS**: Restrict by `ALLOWED_ORIGINS`.

---

## 6. Testing

### Test Pyramid

- **Unit**: Domain logic, pure functions, validators, services.
- **Integration**: Use cases with mocked ports.
- **E2E**: Full HTTP flow with mocked external services.

### Guidelines

- Use Jest. Mock external dependencies.
- Test edge cases: empty input, invalid payload, timeout, fallback.
- Integration tests: override ports with in-memory implementations.
- E2E tests: override repositories and adapters. Use real app bootstrap.

### Naming

- `*.spec.ts` for unit/integration.
- `*.e2e-spec.ts` for E2E.
- Descriptive test names: `it('returns requiresAuth when guest asks for orders', ...)`.

---

## 7. Chatbot-Specific Patterns

### Conversation State

- Stateless API. State in PostgreSQL (`messages`, `conversations`).
- Idempotency via `external_events(source, external_event_id)`.

### LLM Integration

- Abstract behind `LlmPort`.
- Retry with exponential backoff for transient failures.
- Fallback responses when API is unavailable.
- Externalize prompts to `prompts/` for versioning.

### Context Enrichment

- Intent-driven context fetching. One use case per intent category.
- Map external API errors to user-friendly messages.

---

## 8. Git and Commits

- Follow conventional commits when applicable.
- Keep commits focused and atomic.
- Reference issue/ticket numbers in commit messages.

---

## 9. File Structure

```
src/
  common/           # Shared across modules
    config/
    filters/
    middleware/
    types/
    utils/
  modules/
    wf1/
      domain/
        errors/
      application/
        ports/
        use-cases/
      infrastructure/
        adapters/
        repositories/
        security/
      controllers/
      dto/
```

---

## 10. Checklist for New Features

- [ ] Domain logic in domain layer
- [ ] Port interface if new external dependency
- [ ] Use case orchestrates flow
- [ ] Adapter implements port
- [ ] Unit tests for domain and adapters
- [ ] Integration test for use case
- [ ] E2E test if new endpoint
- [ ] No `any` or unsafe casts
- [ ] Secrets in env, not code
- [ ] Update `.env.example` if new env var
