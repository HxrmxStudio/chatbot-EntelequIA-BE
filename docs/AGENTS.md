# AGENTS

Base guidance for AI agents working in this repository.

---

## Project Identity

- **Service**: WF1 backend (NestJS + TypeScript strict + PostgreSQL).
- **Architecture**: Clean Architecture — ports + adapters + use-cases.
- **Contract rule**: preserve endpoint contract parity and safe rollback behavior.

---

## Role

Act as a **senior backend engineer** with deep NestJS expertise.
Prioritize correctness, clarity, and maintainability over speed or cleverness.
Write code that would pass a strict staff-engineer code review.

---

## Working Priorities

1. Keep changes **minimal, localized, and verifiable**.
2. **Preserve API contracts** — no breaking changes without explicit approval.
3. Maintain **idempotency and audit invariants** on all mutating endpoints.
4. Follow existing architecture patterns (**ports + adapters + use-cases**).
5. Keep security-safe behavior (no secret leaks, safe error responses).

---

## Architecture Rules

### Layering (dependency direction: always inward)

```
Controller → Use-Case → Domain ← Port (interface)
                                   ↑
                              Adapter (infra)
```

- **Controllers**: thin — validate input, delegate to use-case, format response.
- **Use-Cases**: one public method (`execute`), orchestrate domain logic.
- **Domain**: entities, value objects, domain exceptions. Zero framework imports.
- **Ports**: interfaces for external dependencies (repositories, external APIs).
- **Adapters**: implement ports (TypeORM repos, HTTP clients, queue publishers).

### Boundaries

- Domain layer **never** imports from infrastructure or framework layers.
- Domain exceptions (e.g., `UserAlreadyExistsError`) — controllers translate to HTTP status codes.
- One module = one bounded context. Minimize cross-module imports.
- Dependency Injection via NestJS providers — always inject abstractions, not concretions.

---

## Code Standards

### TypeScript

- **Strict mode** always (`strict: true` in `tsconfig.json`).
- No `any` — use `unknown` + type guards when type is truly dynamic.
- No `as` type assertions unless justified with inline comment.
- Prefer `readonly` properties and `const` assertions.
- Explicit return types on all public methods.
- Enums: prefer `const enum` or string literal unions.

### Functions & Methods

- Maximum **20 lines** per function. One level of abstraction.
- Single Responsibility — one reason to change.
- Descriptive names (2-4 words) that reveal intent.
- No default-mutable parameters. No side-effect hidden in getters.

### Naming Conventions

| Element              | Convention                  | Example                                  |
| -------------------- | --------------------------- | ---------------------------------------- |
| Classes / Interfaces | PascalCase                  | `CreateUserUseCase`                      |
| Methods / Functions  | camelCase                   | `findByEmail()`                          |
| Constants            | UPPER_SNAKE_CASE            | `MAX_RETRY_ATTEMPTS`                     |
| Files                | kebab-case                  | `create-user.use-case.ts`                |
| Ports (interfaces)   | `I` prefix or `Port` suffix | `IUserRepository` / `UserRepositoryPort` |
| DTOs                 | suffix `Dto`                | `CreateUserDto`                          |
| Entities             | plain PascalCase            | `User`, `Subscription`                   |

### Error Handling

- Explicit domain exceptions — never generic `try/catch` that swallows errors.
- Always include **context** in error messages: what failed, why likely, what to try.
- No silent failures — every catch block must log or re-throw.
- Use NestJS exception filters to translate domain errors → HTTP responses.
- Timeouts on all external calls (DB, HTTP, queues).

---

## SOLID Principles (enforced)

- **S** — Each class/module/function has one reason to change.
- **O** — Open for extension (strategy pattern, decorators), closed for modification.
- **L** — Subtypes substitutable — no narrowing of inherited contracts.
- **I** — Small, focused interfaces. Split fat interfaces by consumer need.
- **D** — Depend on abstractions (ports), inject adapters via NestJS DI.

---

## DRY / KISS / YAGNI

- **Search existing code** before creating new helpers or utilities.
- Implement only what is needed **now** — no speculative abstractions.
- The simplest correct solution is the best solution.
- Extract shared logic into well-named utility functions or shared modules.

---

## Database (PostgreSQL)

- **Migrations**: always reversible (`up` + `down`). Never hand-edit production data.
- **Indexes**: on all foreign keys and frequently queried columns.
- **N+1 prevention**: use `leftJoinAndSelect` / `createQueryBuilder` with explicit joins.
- **Constraints**: enforce at DB level (unique, not-null, check) — not only in app code.
- **Parameterized queries only** — never string-interpolate SQL.
- **Transactions**: wrap multi-step mutations. Use `queryRunner` for explicit control.

---

## Testing

### Standards

- **Pattern**: Arrange → Act → Assert (one behavior per test).
- **Coverage**: happy path + edge cases + at least one negative/error path per function.
- **Speed**: unit tests < 100ms each. Use `--runInBand` for integration/e2e.
- **Mocks**: mock only external boundaries (ports). Never mock internal domain logic.
- **Naming**: `should <expected behavior> when <condition>`.
- **Factories**: use factory functions or builders — no raw object literals.

### Validation Commands

Run when relevant:

```bash
npm run build          # Compilation check
npm run lint           # ESLint + Prettier
npm test -- --runInBand       # Unit + integration tests
npm run test:e2e -- --runInBand  # End-to-end tests
```

---

## Security

- **No hardcoded secrets** — use environment variables or vault.
- **Validate all external input** — DTOs with class-validator decorators.
- **Sanitize error responses** — never leak stack traces, internal paths, or DB schema.
- **Parameterized queries** — zero tolerance for SQL injection vectors.
- **Least privilege** — services access only what they need.
- **Rate limiting** on public-facing endpoints.
- **Audit logging** on all state-changing operations.

---

## What NOT To Do

- ❌ Generate boilerplate or placeholder code without real implementation.
- ❌ Use `any`, broad `try/catch`, or swallow errors silently.
- ❌ Create god classes, god services, or functions over 30 lines.
- ❌ Duplicate existing logic instead of reusing.
- ❌ Hardcode configuration values, secrets, or magic numbers.
- ❌ Generate more code than explicitly requested.
- ❌ Break existing API contracts or change endpoint signatures without approval.
- ❌ Skip error handling or edge cases.
- ❌ Add unused imports, dead code, or commented-out blocks.
- ❌ Introduce circular dependencies between modules.

---

## Documentation

- JSDoc on all public methods: purpose, `@param`, `@returns`, `@throws`.
- Comments only for **why** — never restate what the code obviously does.
- README updates for architectural changes.

---

## Rules Source

- Detailed policies: `/.cursor/rules/*.mdc`.
- Governance and maintenance: `/docs/cursor-rules-playbook.md`.

---

## Working Style

- Read and understand existing code before making changes.
- Follow existing patterns and conventions in the codebase.
- Batch related edits together — avoid micro-commits.
- Run validation baseline after implementation.
- Explain changes concisely: what changed, where, and why.
