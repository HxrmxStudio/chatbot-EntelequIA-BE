# Uncommitted Changes Audit Report

## 1) Summary

- **Reviewed:** All modified files in the working tree (diff scope): `.env.example`, `.github/workflows/wf1-quality-loop.yml`, `README.md`, `package.json`, `scripts/check-db-migration-state.ts`, `src/common/metrics/constants.ts`, `src/modules/wf1/application/ports/adaptive-exemplars.port.ts`, `src/modules/wf1/application/ports/metrics.port.ts`, `handle-incoming-message.use-case.ts`, `prometheus-metrics.adapter.ts`, `pg-adaptive-exemplars.repository.ts`, integration and unit tests. Responsibility boundaries (ports, use case, adapter, repository, CI, scripts) were checked against Clean Architecture and project standards.
- **Risk level:** **Low.** Changes add an optional learning-seed pipeline, exemplar `source` field, and one new metric; core request/response behavior is unchanged. CI gains a validation step and a new script step. Refactors applied were minimal and behavior-preserving.

---

## 2) Findings (Clean Code / DRY / Best Practices)

### Finding 1 – DRY: Duplicated "Validate DB URL network mode" in workflow

- **File + section:** `.github/workflows/wf1-quality-loop.yml` (both jobs had identical inline Node script).
- **Issue:** The same inline script (check `CHATBOT_DB_URL`, reject direct `db.*.supabase.co`) appeared in two jobs, violating DRY and making future changes error-prone.
- **Why it matters:** Single source of truth for CI checks reduces drift and mistakes.
- **What changed:** Extracted the logic to `scripts/validate-ci-db-url.ts`. Both jobs now run: `npx ts-node --files -r tsconfig-paths/register --project tsconfig.json scripts/validate-ci-db-url.ts`. The script reads `CHATBOT_DB_URL`, validates URL and host, logs host:port on success, and `process.exit(1)` with the same error message on failure.

### Finding 2 – Robustness: Prometheus label key delimiter

- **File + section:** `src/modules/wf1/infrastructure/adapters/metrics/prometheus-metrics.adapter.ts` (exemplars Map key build and render).
- **Issue:** Composite key used `|`. If `intent` or `source` ever contained `|`, `key.split('|')` would produce wrong label values. Current values are constrained (IntentName, DB enum), so low likelihood.
- **Why it matters:** Defensive coding avoids subtle metric bugs if values evolve.
- **What changed:** Introduced `const EXEMPLAR_KEY_SEP = '\u001f'` (ASCII unit separator). Key is built and split using `EXEMPLAR_KEY_SEP` instead of `|`.

### Finding 3 – Naming / clarity (scripts/check-db-migration-state.ts)

- **File + section:** `scripts/check-db-migration-state.ts` (migration 12, `constraintContains`).
- **Issue:** None. `constraintContains` is clear; migration 12 verify block is long but single-purpose.
- **What changed:** No code change; structure accepted as-is.

### Finding 4 – Use case and ports

- **Files:** `handle-incoming-message.use-case.ts`, `adaptive-exemplars.port.ts`, `metrics.port.ts`.
- **Issue:** None. Use case depends on ports only; new `incrementExemplarsUsedInPrompt` and exemplar `source` are coherent and propagated from DB.
- **What changed:** No change.

### Finding 5 – Tests

- **Files:** `test/integration/wf1/handle-incoming-message.integration.spec.ts`, `test/unit/wf1/infrastructure/adapters/openai.adapter.spec.ts`.
- **Issue:** None. InMemory implementations and new test correctly assert exemplars-used metric; openai adapter mock updated.
- **What changed:** No change.

### Finding 6 – Repositories list in architecture rule

- **File + section:** `.cursor/rules/refactored-architecture.mdc` (Repository Split).
- **Issue:** Only PgChat, PgIdempotency, PgAudit were listed; `PgAdaptiveExemplarsRepository` (AdaptiveExemplarsPort) exists but was not documented.
- **Why it matters:** Rule should remain the single source of truth for repository roles.
- **What changed:** Added one line under Repository Split: "PgAdaptiveExemplarsRepository: AdaptiveExemplarsPort".

---

## 3) Refactors Applied

- **Workflow DRY:** Added `scripts/validate-ci-db-url.ts` that validates `CHATBOT_DB_URL` (non-empty, valid URL, host not `db.*.supabase.co`), logs host:port on success, and exits 1 with the same error message on failure. Replaced both inline "Validate DB URL network mode" blocks in `.github/workflows/wf1-quality-loop.yml` with a single step that runs this script.
- **Prometheus adapter:** In `prometheus-metrics.adapter.ts`, defined `EXEMPLAR_KEY_SEP = '\u001f'`. In `incrementExemplarsUsedInPrompt`, key is built with `EXEMPLAR_KEY_SEP`; in `renderPrometheus`, key is split with `key.split(EXEMPLAR_KEY_SEP)` so intent/source cannot be broken by a delimiter in values.

---

## 4) Standards Updates

### docs/BEST_PRACTICES.md

- **Exact change:** Under "## 8. Git and Commits", added one bullet:  
  **"Scripts and CI:** Reusable CI checks (e.g. DB URL validation) live in `scripts/` and are invoked from workflows to avoid duplication."
- **Why now:** The review introduced a reusable CI script; the doc now states that such checks belong in `scripts/` and are called from workflows to avoid duplication.

### .cursor/rules/refactored-architecture.mdc

- **Exact change:** Under "## Repository Split", added:  
  `- PgAdaptiveExemplarsRepository: AdaptiveExemplarsPort`
- **Why now:** Keeps the architecture rule aligned with actual repositories; the diff touches adaptive exemplars and metrics, so this was the right moment to document the existing repo.

---

## 5) Build & Tests Evidence

- **Commands executed:**  
  `npm run build`  
  `npm test`

- **Results:**  
  - **Build:** Pass (tsc + tsc-alias completed successfully).  
  - **Tests:** Pass. 62 test suites passed, 4 skipped; 361 tests passed, 9 skipped. No failures.

- **Remaining errors / next steps:** None. If new tests are added later that depend on the previous `|` delimiter in the exemplar metric key, they would still pass because the change is internal to the adapter and the rendered Prometheus output format (intent/source labels) is unchanged.
