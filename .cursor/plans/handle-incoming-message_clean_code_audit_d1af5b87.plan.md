---
name: Handle-incoming-message Clean Code Audit
overview: Structured Clean Code / DRY audit of `handle-incoming-message.use-case.ts` with prioritized findings, a safe refactor plan (no behavior change except documented bug fixes), optional docs/rules updates, and verification steps. Implementation must follow NestJS best practices and must not break existing logic, behaviour, or tests (no regressions). Execution is constrained to the use-case file plus minimal co-located helpers and tests; no new dependencies.
todos: []
isProject: false
---

# Handle-Incoming-Message Clean Code Audit and Refactor Plan

## 1) File Summary

### Purpose

`[handle-incoming-message.use-case.ts](src/modules/wf1/application/use-cases/handle-incoming-message/handle-incoming-message.use-case.ts)` orchestrates the full WF1 chat message pipeline: validate input, idempotency, user resolution, conversation/history load, intent extraction and routing, flow-specific handling (guest order lookup, orders escalation, recommendations disambiguation, price comparison, business policy direct answer, domain scope redirect), context enrichment + LLM when needed, output sanitization, persistence, audit, and metrics.

### Main collaborators

- **Ports (injected)**: IntentExtractorPort, LlmPort, ChatPersistencePort, IdempotencyPort, AuditPort, EntelequiaContextPort, PromptTemplatesPort, MetricsPort, OrderLookupRateLimiterPort, AdaptiveExemplarsPort
- **Concrete (injected)**: EnrichContextByIntentUseCase, EntelequiaOrderLookupClient, ConfigService
- **Domain/helpers**: Many co-located modules under `handle-incoming-message/` (error-mapper, check-if-authenticated, orders-order-lookup-response, resolve-order-lookup-flow-state, resolve-recommendations-flow-state, recommendations-memory, resolve-price-comparison-followup, resolve-domain-scope, resolve-business-policy-direct-answer, etc.)

### Current flow (high level)

1. Validate payload (text type/length/sanitize); throw `BadRequestException` if invalid.
2. Start idempotency; if duplicate, return previous response and audit, then return.
3. Resolve user (`resolveUserContext`), upsert conversation, load history rows and map to message history.
4. Extract intent → validate & enrich → route intent; log sentiment, routed intent, output validation.
5. Compute flow flags: guest order, recommendations pending, orders escalation; resolve “latest bot message” and flow states from history.
6. **Response resolution (long branch)**:

- If guest order flow → `handleGuestOrderLookup` → set response and guest flow state to persist.
- Else if orders escalation → `handlePendingOrdersEscalationFlow` → set response and escalation state.
- Else: optionally clear guest/escalation state; if recommendations pending → `handlePendingRecommendationsFlow`; then recommendation continuation, price comparison, policy direct answer, domain scope; if still no response → enrich context, optional disambiguation, append static/policy/critical context, optional adaptive exemplars, LLM reply → build response. Catch context/backend errors and map to fallback response.

1. If no response set → set generic `ok: false` backend error.
2. Sanitize assistant message (technical terms, catalog narrative, greeting dedupe).
3. Build audit status, context types, store info subtype, UI counts, flow metadata (guest order, recommendations, recommendations memory, orders escalation).
4. **Persist turn** with large metadata object (~35 fields).
5. **Write audit** with a nearly identical metadata object (~32 shared fields + responseType; no catalogSnapshot).
6. Metrics (incrementMessage, observeResponseLatency, stock disclosure, etc.), log “final_stage_audited”, return response.
7. **Catch**: log error, mark idempotency failed, audit with `userId: input.payload.userId`, log and metrics for error, return fallback `ok: false`.

---

## 1.1) NestJS Best Practices (Mandatory)

Refactors must align with NestJS conventions so existing behaviour and module wiring stay intact:

- **Provider / DI**: The use case remains an `@Injectable()` provider. No change to constructor parameters, token injections, or module registration. Extracted helpers are **pure functions or separate injectables**; do not introduce new constructor dependencies unless required for a bug fix.
- **Use case as orchestrator**: NestJS encourages thin controllers and fat use cases for business flows. Decomposing `execute()` into **private methods** of the same class preserves this (single injectable, same DI graph). Extracting to **co-located pure helpers** (same folder) is acceptable and keeps the use case as the single entry point.
- **Testing**: Existing tests use `Test.createTestingModule()` and override ports with mocks. Refactors must **not** require changes to how the use case is provided or overridden in tests, except for new helper modules that are pure and tested in isolation. Integration tests that call `execute()` with fixed inputs must produce the **same outputs** after refactor.
- **Contracts**: The public API of `HandleIncomingMessageUseCase` is `execute(input): Promise<Wf1Response>`. Input and return types, and the shape of `Wf1Response`, must remain unchanged. No removal or renaming of public methods.
- **Errors**: Continue to throw NestJS HTTP exceptions (e.g. `BadRequestException`) from the use case where appropriate; error handling and mapping (e.g. `mapContextOrBackendError`) stay as-is unless a bug fix is documented.
- **Configuration**: Keep using `ConfigService` for `CHAT_HISTORY_LIMIT`, `WF1_RECURSIVE_LEARNING_ENABLED`; no new config keys unless necessary for a documented fix.

---

## 1.2) Regression Prevention (Mandatory)

- **No behaviour change**: Refactors are structural only (extract method, extract helper, DRY metadata). Control flow, branch conditions, and return values must be identical. Any intentional behaviour change (including bug fix) must be explicitly documented and covered by a new or updated test.
- **Test gates**: Run before and after each refactor step:
  - `npm run build`
  - `npm run lint`
  - `npm test -- --runInBand --testPathPattern=handle-incoming-message`
  - Full suite when touching shared utils: `npm test -- --runInBand`
- **Contract parity**: Persist and audit payloads (fields and values) must match current behaviour. When introducing shared turn metadata, validate that `persistTurn` and `writeAudit` receive exactly the same field values they do today (only the construction is centralized).
- **Rollback safety**: Prefer small, reviewable commits (e.g. one: metadata DRY, next: extract one private method) so any regression can be reverted with minimal blast radius.

---

## 2) Findings (Prioritized)

### High: Bug risk / correctness

| Location                                                            | Problem                                                                                                                                                                                                                                                               | Why it matters                                                | Proposed fix                                                                                                                                                                                                                                                                                | Applied   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **persistTurn vs writeAudit metadata** (lines ~818–856 vs ~890–926) | Two large, almost identical metadata objects are built separately. persistTurn includes `requiresAuth` and `...catalogSnapshotMetadata`; audit adds `responseType` and omits catalogSnapshot. Adding or renaming a field in one place is easy to forget in the other. | Bug risk (inconsistent observability/audit), maintainability. | Introduce a single **turn metadata** structure built once (e.g. private `buildTurnMetadata(...)` or a pure helper in the same folder) and pass it to both `persistTurn` and `writeAudit`, with small overrides: persist gets `requiresAuth` + `catalogSnapshot`; audit gets `responseType`. | No (plan) |

### High: Maintainability / complexity

| Location                                            | Problem                                                                                                                            | Why it matters                                                                               | Proposed fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Applied   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **execute() length and branching** (~lines 179–954) | Single method ~775 lines with many sequential `if (!response)` blocks and nested conditionals. Cyclomatic complexity is very high. | Hard to unit-test paths, hard to follow, violates Single Responsibility at the method level. | Extract **phases** into private methods without changing behavior: e.g. `resolveInitialResponse(...)` (guest order / escalation / recommendations / price comparison / policy / scope / LLM path), `applyOutputSanitization(...)`, `buildTurnMetadata(...)`, `persistAndAudit(...)`. Keep `execute()` as a linear sequence of steps (validate → idempotency → user → history → intent → resolve response → sanitize → build metadata → persist → audit → metrics → return).                                                                                                                                                                                                                                                  | No (plan) |
| **File length** (~1824 lines)                       | Use case file contains many private methods and ~15 module-level helper functions at the bottom.                                   | Navigation and review are difficult; domain vs generic helpers mixed.                        | (1) Move **generic** helpers to shared places: `resolveBooleanFlag` → e.g. `src/common/utils/config.utils.ts` (or extend `string.utils.ts`); `areStringArraysEqual` → e.g. `src/common/utils/array.utils.ts`. (2) Move **domain/context** helpers (e.g. `resolveExactStockDisclosure`, `resolveStoreInfoSubtype`, `hasCatalogUiContext`, `shouldCountReturnsPolicyAnswer`, `getContextStringField`, `getContextStringArrayField`, `isCatalogUiMetadata`, `resolveLatestBotMessageFromHistory`, `normalizeLlmReply`, `buildRecommendationsRewriteText`, `buildRecommendationsFlowMetadata`, `buildOrdersEscalationFlowMetadata`) to a co-located file e.g. `handle-incoming-message.helpers.ts` and import from the use case. | No (plan) |

### Medium: DRY / consistency

| Location                   | Problem                                                                                                                                | Why it matters                             | Proposed fix                                                                                                                                                                    | Applied   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Log context repetition** | `request_id`, `conversation_id` (and often `intent`) repeated in many `this.logger.chat` / `this.logger.info` calls (~33 occurrences). | Verbosity, typo risk.                      | Optional: add a small helper e.g. `buildChatLogContext(requestId, conversationId, intent?)` and spread it in log calls. Lower priority than metadata DRY.                       | No (plan) |
| **Magic values**           | `'v2-banded-stock'`, `'fallback_default'`, `lowStockThreshold: 3` appear inline.                                                       | Drift if values change; unclear semantics. | Extract to named constants (e.g. in a small `constants.ts` in the use-case folder or in domain): `RESPONSE_POLICY_VERSION`, `LLM_PATH_FALLBACK_DEFAULT`, `LOW_STOCK_THRESHOLD`. | No (plan) |

### Medium: Architecture / boundaries

| Location                        | Problem                                                                                | Why it matters                                                                      | Proposed fix                                                                                                                                                     | Applied    |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **EntelequiaOrderLookupClient** | Injected by class, not by port.                                                        | BEST_PRACTICES and refactored-architecture say use ports for external dependencies. | Introduce `OrderLookupClientPort` and bind adapter in module; use case depends on port. **Out of scope** for this audit (would touch module and possibly infra). | No (scope) |
| **resolveUserContext**          | Two guards: `checkIfAuthenticated(accessToken)` and `typeof accessToken !== 'string'`. | Redundant if `checkIfAuthenticated` already treats non-string as unauthenticated.   | Verify `checkIfAuthenticated` contract; if it covers non-string, remove redundant `typeof` check; otherwise add a one-line comment.                              | No (plan)  |

### Low: TypeScript / clarity

| Location                                                  | Problem                                                                                                        | Why it matters                                                                                          | Proposed fix                                                                                            | Applied   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| **buildRecommendationsDisambiguationResponseFromContext** | Uses `contextPayload['needsDisambiguation']`, `contextPayload['disambiguationReason']`, etc. with string keys. | Weak typing; refactors can miss renames.                                                                | Optional: define a small interface for recommendations context block payload and use it in this method. | No (plan) |
| **Catch block userId**                                    | Audit in catch uses `input.payload.userId`.                                                                    | If failure happens after user resolution, we might want effectiveUserId—but it’s not in scope in catch. | No change: using `payload.userId` in catch is correct; document in a short comment if desired.          | No (plan) |

---

## 3) Refactor Applied (Diff-Level Overview)

_Below is the **planned** refactor; no edits are performed until the user approves. Every change must preserve existing behaviour and pass all existing tests (NestJS + regression rules above)._

- **Turn metadata DRY**: Add a pure function or private method that builds the shared turn metadata (all common fields). Call it once; pass result to `persistTurn` (adding `requiresAuth`, `catalogSnapshot`) and to `writeAudit` (adding `responseType`). **Invariant**: The exact fields and values passed to `persistTurn` and `writeAudit` must match current behaviour; only the construction is centralized. Verify with existing integration/e2e tests.
- **execute() decomposition** (NestJS: keep as private methods only; no new constructor deps): Split the long “resolve response” section into one or more private methods (e.g. `resolveInitialResponse(...)` returning `{ response, contextBlocks, llmMetadata, ... }` and mutating/returning flow state to persist). Split “sanitize output” and “persist + audit + metrics” into `applyOutputSanitization(...)` and `persistAndAudit(...)`. No change to control flow or return values.
- **Extract generic helpers**: Move `resolveBooleanFlag` to `src/common/utils/config.utils.ts` (or `string.utils.ts`) and `areStringArraysEqual` to `src/common/utils/array.utils.ts`; update imports in the use case. **Invariant**: Same function behaviour (same inputs to same outputs). Add unit tests for moved utils if not already covered; run full suite after move.
- **Extract domain helpers**: Create `handle-incoming-message.helpers.ts` in the same folder (pure functions, no NestJS imports). Import from the use case; do not change any logic. **Invariant**: No change to use case behaviour; tests that cover the use case must still pass without modification (only import paths change).
- **Constants**: Introduce `RESPONSE_POLICY_VERSION`, `LLM_PATH_FALLBACK_DEFAULT`, `LOW_STOCK_THRESHOLD` in a use-case-level `constants.ts`; use them in metadata building. **Invariant**: Same string/number values as today; no behaviour change.
- **Optional**: Add `buildChatLogContext(requestId, conversationId, intent?)` and use it in logger calls (low priority). **Invariant**: Log payloads must be identical (same keys and values).
- **Bug fix**: Only if during refactor a real bug is found: fix, document in commit, and add or adjust test; do not fix "bugs" that would change observable behaviour without explicit approval and test coverage.

---

## 4) Standards Updates (If Any)

- **BEST_PRACTICES.md**: Add a short subsection under “DRY and Maintainability” or “Application: use cases” stating that **turn metadata** (fields shared between persistence and audit) should be built once and passed to both consumers to avoid drift; mention optional “phase” extraction for very long `execute()` methods.
- **refactored-architecture.mdc**: Under handle-incoming-message, add a note that long use-case files may co-locate a `*.helpers.ts` for pure functions and that shared turn metadata should be built in one place for persist + audit.

_Exact edits will be proposed when implementing the refactor._

---

## 5) Build & Tests Evidence (Planned)

- **Commands** (run before and after each refactor step):
  - `npm run build`
  - `npm run lint`
  - `npm test -- --runInBand --testPathPattern=handle-incoming-message`
  - `npm test -- --runInBand` (full suite after any change to shared utils or use case)
- **Expected**: All pass before and after refactor. No regression: existing integration and e2e tests must pass without changing their assertions or mocks (except when adding a documented bug fix).
- **If failing**: Fix before proceeding (e.g. fix types after moving helpers, or adjust only the refactored code so behaviour stays identical). Do not change test expectations to match refactored code unless the change is a documented bug fix with an explicit test update.

---

## Scope Reminder

- Primary edits: `[handle-incoming-message.use-case.ts](src/modules/wf1/application/use-cases/handle-incoming-message/handle-incoming-message.use-case.ts)`.
- Other files only: new/updated co-located helpers, `constants.ts`, common utils, tests for this use case, and the two docs/rules files. No new dependencies; no broad rewrites beyond this use case.
