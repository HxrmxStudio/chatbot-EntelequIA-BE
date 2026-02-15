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
- Examples: `resolveOptionalString` (string.utils.ts), `coerceTimestamp` (date.utils.ts), `ensureObject` (object.utils.ts).
- Keep utilities pure and framework-agnostic when possible.
- Domain-specific utilities (e.g., `parseMoney`, `formatMoney`) belong in domain modules (e.g., `domain/money/`).

### Constants

- Single source of truth for limits (e.g. `WF1_MAX_TEXT_CHARS` in `domain/text-policy/constants.ts`).
- Do not duplicate magic numbers. Use named constants.

### Turn metadata (persist and audit)

- When the same metadata is written to both persistence and audit (e.g. turn metadata with many shared fields), build it **once** (e.g. via a pure `buildSharedTurnMetadata` helper or private method) and pass the result to both consumers, adding only the consumer-specific fields (e.g. `requiresAuth` and `catalogSnapshot` for persist; `responseType` for audit). This avoids drift when adding or renaming fields.
- For very long `execute()` methods, consider extracting phases into **private methods** of the same use case (e.g. response resolution, output sanitization, persist-and-audit) so behaviour stays unchanged and the use case remains the single entry point.

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
- **Externalize all prompts/instructions** to `prompts/` for versioning:
  - System prompts for LLM adapters
  - Context templates and instructions
  - Hints and guidance text
  - Use `loadPromptFile` from `adapters/shared` to load prompts
  - Maintain fallback defaults in `constants.ts` if file is missing
  - Version prompts with `_v1.txt`, `_v2.txt`, etc.

### Context Enrichment

- Intent-driven context fetching. One use case per intent category.
- Map external API errors to user-friendly messages.

---

## 8. Git and Commits

- Follow conventional commits when applicable.
- Keep commits focused and atomic.
- Reference issue/ticket numbers in commit messages.
- **Scripts and CI:** Reusable CI checks (e.g. DB URL validation) live in `scripts/` and are invoked from workflows to avoid duplication.

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
        products-context/
        money/
        intent/
        intent-routing/
        text-policy/
        context-block/
        user/
        wf1-response/
        ui-payload/
        conversation-history/
        output-validation/
        prepare-conversation-query/
        text-sanitizer/
        source/
      application/
        ports/
        use-cases/
          handle-incoming-message/
          enrich-context-by-intent/
      infrastructure/
        adapters/
          shared/
          openai-retry/
          intent-validator/
          openai/
          intent-extractor/
          entelequia-http/
        repositories/
          shared/
        security/
      controllers/
      dto/
```

### 9.1 Domain: una carpeta por concepto

Cada concepto de domain vive en su **propia carpeta** para mantener el orden y un criterio uniforme:

- **Entrada pública**: siempre `index.ts` que reexporta tipos, constantes y funciones del concepto.
- **Contenido opcional**: según el tamaño del concepto:
  - `types.ts` — interfaces y tipos
  - `constants.ts` — constantes
  - Módulos de lógica pura (p. ej. `summary.ts`, `match.ts`, `resolve.ts`, `map.ts`, `sentiment.ts`, `build-query.ts`, `sanitize.ts`)
- **Imports**: los consumidores importan `from '.../domain/nombre-concepto'` (el path no cambia al migrar de archivo plano a carpeta porque se resuelve al `index.ts`).

Ejemplos:

- `domain/products-context/` — `types.ts`, `constants.ts`, `summary.ts`, `match.ts`, `index.ts`
- `domain/money/` — `types.ts`, `parse.ts`, `format.ts`, `index.ts` (concepto compartido entre productos y órdenes)
- `domain/intent/` — `types.ts`, `constants.ts`, `index.ts`
- `domain/text-policy/` — `constants.ts`, `index.ts`
- `domain/source/` — solo `index.ts`

### 9.2 Application: use cases con carpeta por concepto

Cada use case vive en su **propia carpeta** siguiendo Clean Code principles (Single Responsibility, Separation of Concerns):

- **Entrada pública**: `index.ts` que exporta la clase del use case.
- **Clase principal**: `nombre-use-case.use-case.ts` con el método `execute` que orquesta el flujo.
- **Helpers/utilities**: funciones puras extraídas en módulos separados (p. ej. `error-mapper.ts`, `query-resolvers/`, `product-parsers.ts`).
- **Imports**: los consumidores importan `from '.../application/use-cases/nombre-use-case'` (resuelve al `index.ts`).

Ejemplos:

- `use-cases/handle-incoming-message/` — `handle-incoming-message.use-case.ts` (thin orchestrator), `index.ts`, `orchestration/` (phase orchestration), `flows/orders|recommendations|pricing|policy/` (flow logic and state transitions), `responses/orders|recommendations|pricing/` (deterministic response builders), `support/` (constants/helpers/metadata builders)
- `use-cases/enrich-context-by-intent/` — `enrich-context-by-intent.use-case.ts`, `query-resolvers/` (types, patterns, normalize, clean-entities, detect-category, resolve-products, resolve-order, resolve-payment-shipping-query-type, resolve-recommendations-preferences, recommendation-type-slugs, resolve-store-info-query-type, resolve-ticket-signals, resolve-stock-disclosure, category-slugs, index), `product-parsers.ts`, `order-parsers.ts`, `payment-info-parsers.ts`, `recommendation-parsers.ts`, `index.ts`

Los helpers se extraen como funciones puras (sin dependencias de framework) para mantener la separación de responsabilidades: el use case orquesta, los helpers procesan datos. Cuando los mensajes de respuesta contienen formato complejo o contenido compartido, se extraen como módulos helper separados (p. ej. `orders-unauthenticated-response.ts` para respuestas de autenticación de órdenes con guía enriquecida). Cuando se extrae información de payloads de API, se usan módulos parser dedicados (p. ej. `order-parsers.ts`, `payment-info-parsers.ts`) que proporcionan funciones puras para extracción y validación de datos. Access token is resolved in the controller via `resolve-access-token.ts` using `Authorization: Bearer <token>` as the only accepted source. Requests that include `accessToken` in body are rejected in input validation with `400 Bad Request`. The orders branch runs only when a token is present, using `checkIfAuthenticated`; that gate does not validate or decode the token, only checks presence.

#### 9.2.2 User resolution and effective user ID

The effective user for each request is resolved by `resolveUserContext(payload)` in `use-cases/handle-incoming-message/orchestration/prepare-request-context.ts`:

- If not authenticated (no valid Bearer token): guest user via `chatPersistence.upsertUser(payload.userId)`
- If authenticated (valid Bearer token): `entelequiaContextPort.getAuthenticatedUserProfile({ accessToken })` followed by `chatPersistence.upsertAuthenticatedUserProfile(...)` with profile data (id, email, phone, name)
- On 401 from profile endpoint: falls back to guest user (token present but invalid/expired)
- If profile payload is invalid (e.g. empty email/name): fail fast and route through the global failure finalizer.

All persistence operations (conversation upsert, history retrieval, persistTurn, audit) use `effectiveUserId` (from resolved `UserContext.id`) instead of `payload.userId`, ensuring all data is keyed by the resolved user identity (guest or authenticated).

#### 9.2.3 Use-case growth guardrails

- Large use-cases must be split by responsibility boundaries:
  - `orchestration/` for phase orchestration and IO boundaries.
  - `flows/` for business/flow state transitions (prefer pure logic).
  - `responses/` for deterministic message builders.
  - `support/` for reusable helpers/constants.
- `handle-incoming-message.use-case.ts` must remain a thin orchestrator and should not absorb flow-specific policy logic.
- Enforced lint limits:
  - Global `src/**/*.ts`: `max-lines` 1200 and `max-lines-per-function` 650.
  - `src/modules/wf1/application/use-cases/handle-incoming-message/**/*.ts`: `max-lines` 500 and `max-lines-per-function` 200.

#### 9.2.1 Query resolvers: category detection and categorySlug

Product category detection and the mapping to Entelequia `categorySlug` live in `query-resolvers/` (`detect-category.ts`, `resolve-products.ts`, `category-slugs.ts`). `ResolvedProductsQuery.categorySlug` is passed to `getProducts({ categorySlug })` to filter by the store's product tree. Slug values are centralized in `category-slugs.ts` as the single source of truth and must be kept aligned with the Entelequia API (e.g. `GET /api/v1/products-list/{categorySlug}`).

### 9.3 Infrastructure: adapters con carpeta por concepto y helpers compartidos (DRY)

Cada adapter vive en su **propia carpeta** siguiendo Clean Code principles y DRY:

- **Entrada pública**: `index.ts` que exporta la clase del adapter.
- **Clase principal**: `nombre.adapter.ts` con `@Injectable()` que implementa el port.
- **Endpoints**: `endpoints.ts` centraliza todas las URLs/rutas, incluyendo:
  - Endpoints de API externa (p. ej. funciones helper para construir rutas de API)
  - URLs del web frontend (p. ej. `productWebUrl`, `storageImageUrl` para URLs públicas)
- **Helpers específicos**: funciones puras extraídas en módulos separados dentro de la carpeta del adapter (p. ej. `openai-client.ts`, `payload-normalizers.ts`, `product-helpers.ts`).
- **Helpers compartidos**: código duplicado extraído a `shared/` dentro de `adapters/` (p. ej. `prompt-loader.ts`, `http-client.ts`, `schema-loader.ts`).
- **Imports**: los consumidores importan `from '.../infrastructure/adapters/nombre-adapter'` (resuelve al `index.ts`).

Ejemplos:

- `adapters/openai/` — `openai.adapter.ts`, `endpoints.ts`, `openai-client.ts`, `prompt-builder.ts`, `fallback-builder.ts`, `constants.ts`, `errors.ts`, `retry-helpers.ts`, `types.ts`, `index.ts`
- `adapters/intent-extractor/` — `intent-extractor.adapter.ts`, `endpoints.ts`, `openai-client.ts`, `text-helpers.ts`, `response-helpers.ts`, `constants.ts`, `index.ts`
- `adapters/entelequia-http/` — `entelequia-http.adapter.ts`, `endpoints.ts`, `entelequia-client.ts`, `payload-normalizers.ts`, `product-helpers.ts`, `entelequia-order-lookup.client.ts`, `bot-hmac-signer.ts`, `base-url.ts`, `index.ts`
- `adapters/metrics/` — `prometheus-metrics.adapter.ts` (Prometheus metrics)
- `adapters/rate-limit/` — `redis-order-lookup-rate-limiter.adapter.ts`, `index.ts` (Redis rate limiting)
- `adapters/shared/` — `prompt-loader.ts`, `http-client.ts`, `schema-loader.ts` (compartidos por múltiples adapters)

Los helpers compartidos eliminan duplicación (DRY) del patrón de timeout HTTP, carga de prompts, y carga de schemas JSON. Los archivos `endpoints.ts` centralizan las definiciones de endpoints (tanto de API como URLs del web frontend como `productWebUrl` y `storageImageUrl`) para mejorar mantenibilidad y seguir Single Responsibility Principle.

### 9.3.1 Infrastructure: prompt-templates adapter

El adapter `prompt-templates/` centraliza la carga y acceso a todos los prompts del sistema:

- **Port**: `PromptTemplatesPort` define la interfaz para acceder a prompts
- **Adapter**: `PromptTemplatesAdapter` implementa el port, carga prompts desde filesystem en constructor
- **Constantes**: `constants.ts` contiene todos los paths de prompts y valores DEFAULT como fallback
- **Imports**: los use cases inyectan `PROMPT_TEMPLATES_PORT` para acceder a prompts

Ejemplo:

- `adapters/prompt-templates/` — `prompt-templates.adapter.ts`, `constants.ts`, `index.ts`

**Beneficios**:

- Centralización: todos los prompts accesibles desde un solo port
- Testabilidad: fácil mockear prompts en tests
- Mantenibilidad: cambios en prompts no requieren modificar use cases
- DRY: elimina carga duplicada de prompts en múltiples lugares

### 9.4 Infrastructure: security con carpeta services y helpers compartidos (DRY)

Todos los servicios de seguridad están agrupados bajo `services/` siguiendo las mejores prácticas de NestJS. Cada servicio vive en su **propia carpeta** siguiendo Clean Code principles y DRY:

- **Estructura**: `security/services/nombre-servicio/` agrupa todos los servicios relacionados.
- **Entrada pública**: `index.ts` que exporta la clase del servicio.
- **Clase principal**: `nombre.service.ts` con `@Injectable()` que implementa la lógica de seguridad.
- **Helpers específicos**: funciones puras extraídas en módulos separados dentro de la carpeta del servicio (p. ej. `web-signature-validator.ts`, `whatsapp-signature-validator.ts`, `field-validators.ts`, `field-extractor.ts`).
- **Helpers compartidos**: código duplicado extraído a `shared/` dentro de `security/` (p. ej. `string-helpers.ts`, `crypto-helpers.ts`, `body-helpers.ts`).
- **Guards**: se mantienen en la raíz de `security/` (patrón estándar de NestJS).
- **Imports**: los consumidores importan `from '.../infrastructure/security/services/nombre-servicio'` (resuelve al `index.ts`).

Ejemplos:

- `security/services/signature-validation/` — `signature-validation.service.ts`, `web-signature-validator.ts`, `whatsapp-signature-validator.ts`, `types.ts`, `constants.ts`, `index.ts`
- `security/services/turnstile-verification/` — `turnstile-verification.service.ts`, `turnstile-client.ts`, `types.ts`, `constants.ts`, `index.ts`
- `security/services/input-validation/` — `input-validation.service.ts`, `field-validators.ts`, `types.ts`, `constants.ts`, `index.ts`
- `security/services/extract-variables/` — `extract-variables.service.ts`, `field-extractor.ts`, `types.ts`, `constants.ts`, `index.ts`
- `security/services/text-sanitizer/` — `text-sanitizer.ts`, `index.ts`
- `security/shared/` — `string-helpers.ts`, `crypto-helpers.ts`, `body-helpers.ts` (compartidos por múltiples servicios)

Los helpers compartidos eliminan duplicación (DRY) de funciones como `secureEquals` y `resolveBody`. Nota: `resolveOptionalString` se consolidó en `common/utils/string.utils.ts` y se re-exporta desde `security/shared/string-helpers.ts`.

### 9.6 Domain: context-block con funciones de renderizado

El dominio `context-block/` proporciona funciones puras para manipular y renderizar context blocks:

- **Tipos**: `types.ts` define `ContextBlock`, `ContextType`
- **Renderizado**: `render.ts` con `renderContextBlocksForPrompt()` convierte blocks a string para prompts
- **Manipulación**: `append-static-context.ts` con `appendStaticContextBlock()` agrega/reemplaza static context
- **Imports**: los consumidores importan `from '@/modules/wf1/domain/context-block'` (resuelve al `index.ts`)

Ejemplos:

- `domain/context-block/` — `types.ts`, `render.ts`, `append-static-context.ts`, `index.ts`

Las funciones de dominio son puras (sin side effects) y siguen principios de Clean Code (SRP, funciones pequeñas, bien documentadas con JSDoc).

### 9.5 Infrastructure: repositories con helpers compartidos (DRY)

Los repositorios comparten helpers comunes para operaciones JSON y conversión de tipos:

- **Helpers compartidos**: código común extraído a `repositories/shared/` (p. ej. `json-helpers.ts` con `toJsonb`).
- **Imports**: los repositorios importan `from './shared'` para usar helpers compartidos.

Ejemplos:

- `repositories/shared/` — `json-helpers.ts` con `toJsonb` (convierte valores a JSON string para columnas jsonb)
- `repositories/pg-chat.repository.ts` — usa `toJsonb` y `coerceTimestamp` (desde `common/utils/date.utils.ts`). Para WhatsApp, el outbox incluye `conversation_id` y `message_id` con `ON CONFLICT (message_id, channel, to_ref) DO NOTHING` para idempotencia.

Los helpers compartidos eliminan duplicación (DRY) de operaciones JSON y conversión de timestamps.

### 9.6 Common utilities: consolidación de funciones compartidas

Las funciones utilitarias compartidas se consolidan en `src/common/utils/`:

- **string.utils.ts**: `resolveOptionalString` (consolidado desde security/shared)
- **date.utils.ts**: `coerceTimestamp` (movido desde pg-chat.repository.ts)
- **object.utils.ts**: `ensureObject`, `isRecord` (helpers para validación de objetos)

Estas utilidades son puras (sin dependencias de framework) y pueden ser usadas en cualquier capa siguiendo las reglas de dependencia de Clean Architecture.

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
