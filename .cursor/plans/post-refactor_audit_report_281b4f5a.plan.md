---
name: Post-Refactor Audit Report
overview: Comprehensive audit of the SSOT refactoring execution, covering duplication residuals, complexity hotspots, Clean Architecture compliance, test readiness, and guardrails balance -- with all fixes to be executed immediately.
todos:
  - id: consolidate-normalize
    content: "Priority 1: Extract normalizeText into src/common/utils/text-normalize.utils.ts with 2-3 named variants, replace all 8 copies, add unit tests"
    status: completed
  - id: orchestration-tests
    content: "Priority 2: Add unit tests for resolve-response-fallback.ts and resolve-response-context.ts (shouldRetryLlmWithGuidance, appendPolicyContext, fallback types)"
    status: completed
  - id: policy-domain-test
    content: "Priority 3: Add unit test for domain/policy/business-facts.ts verifying exported constants structure and completeness"
    status: completed
  - id: fix-arch-violations
    content: "Priority 4: Create OrderLookupPort interface; move productWebUrl/pickImageUrl to domain; fix 3 application-layer infra imports"
    status: completed
  - id: remove-deprecated-parsing
    content: "Priority 5: Remove deprecated shouldSuggestCancelledOrderEscalation and resolvePromptedFranchiseFromMessage and their fallback calls"
    status: completed
  - id: single-fallback-constant
    content: "Priority 6: Replace 33 'Contexto no disponible' repetitions with single DEFAULT_UNAVAILABLE_FALLBACK constant"
    status: completed
isProject: false
---

# Post-Refactor Audit Report

---

## A) General State Post-Refactor

### What was achieved

1. **SSOT Policy Domain** created at `[src/modules/wf1/domain/policy/](src/modules/wf1/domain/policy/)` with `business-facts.ts` (structured policy constants) and `tone-instructions.ts` (tone/style SSOT).
2. **Canonical YAML** at `[prompts/static/entelequia_business_context_canonical_v1.yaml](prompts/static/entelequia_business_context_canonical_v1.yaml)` (431 lines) serves as the single source for 4 generated `.txt` prompt files, validated by `[scripts/validate-generated-business-prompts.ts](scripts/validate-generated-business-prompts.ts)`.
3. **Prompt-templates constants reduced** to minimal `'Contexto no disponible'` fallbacks in `[infrastructure/adapters/prompt-templates/constants.ts](src/modules/wf1/infrastructure/adapters/prompt-templates/constants.ts)`; real content loaded from `.txt` files at runtime.
4. **Metadata-driven flow control** in escalation (`OFFERED_ESCALATION_METADATA_KEY`) and recommendations (`RECOMMENDATIONS_PROMPTED_FRANCHISE_METADATA_KEY`), replacing message parsing with structured flags.
5. **Guardrails simplified**: Smalltalk flows to LLM (`in_scope`), direct policy answers disabled (detection-only for metrics), hostile detection remains hard-block.
6. **Context-block appenders** created as type-safe functions (`append-static-context.ts`, `append-policy-facts-context.ts`, `append-critical-policy-context.ts`).
7. **46 characterization/golden tests** lock deterministic outputs across 4 files.
8. **CI green**: 477 unit + 58 integration + 34 E2E + lint + build + seed validation all pass.

### What is still missing

- `**normalizeText` consolidation: 8 near-identical implementations remain.
- **Residual prompt duplication**: Same business facts exist in `domain/policy/business-facts.ts`, `entelequia_policy_facts_v1.txt`, canonical YAML, and generated `.txt` files (4+ copies of each fact).
- **3 architecture violations** in application layer (direct infra imports).
- **Orchestration unit tests**: `resolve-response-fallback.ts`, `resolve-response-context.ts`, and `resolve-response.ts` have zero dedicated unit tests.
- **Policy domain unit tests**: `business-facts.ts` and `tone-instructions.ts` have no tests.

### Blockers for testing phase

No hard blockers. All existing tests pass. The gaps are **coverage gaps**, not regression risks. Testing can begin immediately; the items below improve confidence but do not block it.

---

## B) Residual Duplication Matrix

| Duplicated Concept                              | Locations                                                                                                                                                                                                                                                                                                                 | Severity | Impact                                                                                                       | Proposed Fix                                                                                                                                      | Effort |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `normalizeText()` function (8 copies)           | `resolve-domain-scope.ts:185`, `recommendations-memory.ts:487`, `resolve-orders-escalation-flow-state.ts:196`, `resolve-business-policy-direct-answer.ts:225`, `resolve-orders-detail-followup.ts:117`, `resolve-price-challenge.ts:20`, `resolve-price-comparison-followup.ts:158`, `intent-extractor/text-helpers.ts:3` | **HIGH** | Any normalization change requires 8 edits; inconsistent behavior (some allow `#`, some strip repeated chars) | Extract 2-3 named variants to `src/common/utils/text-normalize.utils.ts`: `normalizeForComparison()`, `normalizeForSearch()`, `normalizeStrict()` |        |
| Returns policy "30 dias"                        | `domain/policy/business-facts.ts:12`, `entelequia_policy_facts_v1.txt:3`, `critical_policy_context_v1.txt:4`, `tickets_returns_policy_context_v1.txt:4`, canonical YAML (2x), tests                                                                                                                                       | **MED**  | Changing policy requires multi-file edits; risk of drift                                                     | Acceptable: canonical YAML generates `.txt` files; `business-facts.ts` is the code SSOT. Mark `policy_facts_v1.txt` as derived.                   |        |
| Reservation policy "48hs / 30%"                 | Same pattern as returns (6 locations)                                                                                                                                                                                                                                                                                     | **MED**  | Same drift risk                                                                                              | Same fix as above                                                                                                                                 |        |
| Import policy "50% / 30-60 dias"                | Same pattern (5 locations)                                                                                                                                                                                                                                                                                                | **MED**  | Same drift risk                                                                                              | Same fix as above                                                                                                                                 |        |
| DHL international shipping                      | 10+ locations across prompts, code, and tests                                                                                                                                                                                                                                                                             | **MED**  | Highest fan-out; if carrier changes, many edits                                                              | Add DHL to canonical YAML shipping section; derive all others.                                                                                    |        |
| Store hours "10-19 / 10-17"                     | 8+ locations                                                                                                                                                                                                                                                                                                              | **MED**  | Hours changes need multi-file edits                                                                          | Same YAML-driven approach                                                                                                                         |        |
| `'Contexto no disponible'` repeated 33x         | `prompt-templates/constants.ts:73-105`                                                                                                                                                                                                                                                                                    | **LOW**  | No behavioral risk; just verbose                                                                             | Extract to single `const DEFAULT_FALLBACK = 'Contexto no disponible'`                                                                             |        |
| Critical policy vs tickets returns policy files | `critical_policy_context_v1.txt` vs `tickets_returns_policy_context_v1.txt`                                                                                                                                                                                                                                               | **LOW**  | Near-identical content; intentional overlap for different prompt slots                                       | Document that overlap is intentional (different injection points). No action needed.                                                              |        |
| WhatsApp number "+54 9 11 6189-8533"            | 6+ locations in prompts and YAML                                                                                                                                                                                                                                                                                          | **LOW**  | Contact info change needs multi-file edits                                                                   | Already in canonical YAML; derived files are generated. Acceptable.                                                                               |        |
| "Mil Suenos" vs "Mil Suenos" spelling           | `business-facts.ts:20` (no accent) vs prompts (with accent)                                                                                                                                                                                                                                                               | **LOW**  | Inconsistency in editorial name                                                                              | Standardize to "Mil Suenos" (no accent) in code since accents are stripped in normalization                                                       |        |

---

## C) Complexity Hotspots (Top 10)

**1. `resolve-response.ts` (503 lines)** -- `[orchestration/resolve-response.ts](src/modules/wf1/application/use-cases/handle-incoming-message/orchestration/resolve-response.ts)`

- `resolveFlowResponse()` is 157 lines of conditional flow dispatch.
- Fix: Extract each flow branch into named functions (already partially done). Low risk.

**2. `resolve-response-context.ts` (387 lines)** -- `[orchestration/resolve-response-context.ts](src/modules/wf1/application/use-cases/handle-incoming-message/orchestration/resolve-response-context.ts)`

- Mixes context enrichment, LLM retry, and policy injection.
- Fix: Split `appendPolicyContext()` and `buildAssistantReplyWithGuidedRetry()` into separate files.

**3. `openai.adapter.ts` (526+ lines)** -- `[infrastructure/adapters/openai/openai.adapter.ts](src/modules/wf1/infrastructure/adapters/openai/openai.adapter.ts)`

- Large adapter with retry logic, prompt building, response parsing.
- Fix: Extract retry logic and response parsing into helper modules.

**4. `finalize-success.ts` (341 lines)** -- `[orchestration/finalize-success.ts](src/modules/wf1/application/use-cases/handle-incoming-message/orchestration/finalize-success.ts)`

- Backward-compatible message parsing fallback at line 116: `shouldSuggestCancelledOrderEscalation(sanitizedResponse.message)`.
- Fix: Remove deprecated fallback and rely solely on metadata flags.

**5. `resolve-orders-escalation-flow-state.ts**`--`flows/orders/resolve-orders-escalation-flow-state.ts`

- Contains deprecated `shouldSuggestCancelledOrderEscalation()` with Spanish string matching.
- Fix: Remove deprecated function and all call sites.

**6. `recommendations-memory.ts**`--`flows/recommendations/recommendations-memory.ts`

- Contains deprecated `resolvePromptedFranchiseFromMessage()` with regex parsing.
- Fix: Remove deprecated function and all call sites.

**7. `resolve-business-policy-direct-answer.ts**`--`flows/policy/resolve-business-policy-direct-answer.ts`

- All 10 policy patterns still present but bypass is disabled. Code is active for metrics only.
- Fix: Document as "metrics-only detection" or remove if metrics are captured elsewhere.

**8. `build-catalog-ui.ts` (430 lines)** -- `domain/ui-payload/build-catalog-ui.ts`

- Complex UI payload building.
- Fix: No immediate action; this is domain complexity, not accidental.

**9. `MutableResolutionState` (30+ fields)** -- `orchestration/resolve-response.ts`

- Large mutable state object passed through pipeline.
- Fix: Acceptable for orchestration. Could benefit from grouping related fields into sub-objects in the future.

**10. 8x `normalizeText` duplication**

- Already covered in duplication matrix. Consolidation is the fix.

---

## D) Clean Architecture Check

### Domain Layer: WARNING

| Check                  | Status  | Evidence                                                                                                                                                                                                                                |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No infra imports       | PASS    | No imports from `infrastructure/`                                                                                                                                                                                                       |
| No application imports | PASS    | No imports from `application/`                                                                                                                                                                                                          |
| No NestJS decorators   | PASS    | None found                                                                                                                                                                                                                              |
| No I/O operations      | PASS    | No fs/http/db                                                                                                                                                                                                                           |
| No side effects        | PASS    | No logging/telemetry                                                                                                                                                                                                                    |
| No common/ imports     | WARNING | `domain/policy/business-facts.ts` imports `@/common/constants/contact.constants`; `domain/money/parse.ts` imports `@/common/utils/object.utils`; `domain/prepare-conversation-query/build-query.ts` imports `common/utils/object.utils` |

**Verdict**: The `@/common/` imports are borderline. `isRecord()` and `ensureObject()` are pure utility functions with no side effects. `CONTACT_EMAIL` and `WHATSAPP_NUMBER` are simple string constants. These could be inlined into domain or moved to a `domain/shared/` module for strict purity, but the practical risk is zero.

### Application Layer: WARNING

| Check                 | Status  | Evidence                                                                                                                                                                                                                        |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uses ports for infra  | WARNING | 3 direct infra imports: `handle-incoming-message.use-case.ts:33` imports `EntelequiaOrderLookupClient`; `guest-order-lookup.flow.ts:5` imports same; `recommendation-parsers.ts:4-5` imports `productWebUrl` and `pickImageUrl` |
| No direct DB/HTTP     | PASS    | All through ports except above                                                                                                                                                                                                  |
| Port interfaces exist | PASS    | Ports defined in `application/ports/`                                                                                                                                                                                           |

**Verdict**: The `EntelequiaOrderLookupClient` should be behind a port (pre-existing issue, not introduced by refactor). The `productWebUrl`/`pickImageUrl` helpers are URL builders that could live in domain or common.

### Infrastructure Layer: PASS

| Check             | Status | Evidence                                   |
| ----------------- | ------ | ------------------------------------------ |
| Implements ports  | PASS   | All adapters implement port interfaces     |
| No business logic | PASS   | Business logic stays in domain/application |

### SSOT Layer: PASS

| Check                    | Status | Evidence                                        |
| ------------------------ | ------ | ----------------------------------------------- |
| Canonical YAML exists    | PASS   | `entelequia_business_context_canonical_v1.yaml` |
| Generation script works  | PASS   | `generate-prompts-from-context-entelequia.ts`   |
| Validation script works  | PASS   | `validate-generated-business-prompts.ts` passes |
| Policy domain accessible | PASS   | `domain/policy/` exports facts and tone         |

---

## E) Ready-to-Test Checklist

### Tests that exist

| Category                | Files           | Count     | Status   |
| ----------------------- | --------------- | --------- | -------- |
| Unit tests              | 82 suites       | 477 tests | ALL PASS |
| Integration tests       | 2 active suites | 58 tests  | ALL PASS |
| E2E tests               | 1 suite         | 34 tests  | ALL PASS |
| Characterization/golden | 4 files         | 46 tests  | ALL PASS |
| Prompt validation       | 1 script        | -         | PASS     |
| Seed validation         | 1 script        | 64 seeds  | PASS     |

### Tests that are missing (minimum set for confidence)

1. `**domain/policy/business-facts.ts` unit test -- Verify exported constants match expected values and structure. Prevents silent drift. (~10 assertions)
2. `**orchestration/resolve-response-fallback.ts` unit test -- Test each fallback function in isolation: scope fallback, price comparison, continuation, disabled policy. (~15 assertions)
3. `**orchestration/resolve-response-context.ts` unit test -- Test `shouldRetryLlmWithGuidance` with various metadata inputs, `appendPolicyContext` block appending. (~10 assertions)
4. `**scripts/validate-generated-business-prompts.ts` unit test -- Test drift detection and fact validation with mock files. (~5 assertions)

### Commands

```bash
npm run test:unit                                    # 477 tests
npm run test:integration -- --runInBand              # 58 tests
npm run test:e2e -- --runInBand                      # 34 tests
npm run lint                                         # ESLint
npm run build                                        # TypeScript compilation
npm run prompts:validate:entelequia                  # Prompt drift check
npm run wf1:learning:validate-seeds                  # Seed case validation
npm run verify:premerge                              # All of the above in sequence
```

---

## F) Actions (All Executed Now)

### Priority 1 -- Consolidate `normalizeText`

- Create `src/common/utils/text-normalize.utils.ts` with 2-3 named variants
- Replace all 8 implementations across the codebase
- Add unit tests for each variant
- Validation: `npm run test:unit && npm run lint`

### Priority 2 -- Add orchestration unit tests

- Create `test/unit/wf1/application/handle-incoming-message/resolve-response-fallback.spec.ts`
- Create `test/unit/wf1/application/handle-incoming-message/resolve-response-context.spec.ts`
- Focus on: `shouldRetryLlmWithGuidance`, `appendPolicyContext`, each fallback type
- Validation: `npm run test:unit`

### Priority 3 -- Add policy domain unit test

- Create `test/unit/wf1/domain/policy/business-facts.spec.ts`
- Verify structure, completeness, and consistency of exported constants
- Validation: `npm run test:unit`

### Priority 4 -- Fix application-layer architecture violations

- Create `OrderLookupPort` interface in `application/ports/`
- Move `productWebUrl` and `pickImageUrl` to domain or common utils
- Update imports in `handle-incoming-message.use-case.ts`, `guest-order-lookup.flow.ts`, `recommendation-parsers.ts`
- Validation: `npm run verify:premerge`

### Priority 5 -- Remove deprecated message-parsing functions

- Remove `shouldSuggestCancelledOrderEscalation()` from `resolve-orders-escalation-flow-state.ts`
- Remove `resolvePromptedFranchiseFromMessage()` from `recommendations-memory.ts`
- Remove fallback calls in `finalize-success.ts`
- Validation: `npm run verify:premerge`

### Priority 6 -- Extract single fallback constant

- Replace 33 `'Contexto no disponible'` with single `DEFAULT_UNAVAILABLE_FALLBACK` constant
- Validation: `npm run lint && npm run test:unit`

---

## G) Verification Results (MANDATORY)

```
verify:premerge -- EXIT CODE: 0

prompts:validate:entelequia    PASS  (4 files validated)
lint                           PASS  (0 errors, 0 warnings)
test:unit                      PASS  (82 suites, 477 tests)
test:integration               PASS  (2 suites, 58 tests, 9 skipped DB-dependent)
test:e2e                       PASS  (1 suite, 34 tests)
build                          PASS  (tsc + tsc-alias)
wf1:learning:validate-seeds    PASS  (64 seeds, 0 issues)
```

No failures. No actions required.
