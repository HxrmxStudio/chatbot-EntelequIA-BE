Engineering activity captured here covers Mainder-API and Skyline-v9 activity visible in GitHub during the last ~7 days, focused on merged PRs / release merges into main plus notable platform changes shipped via PR. Activity for back-office and infojobs-workers (MultipostingService) could not be verified within the available repository data retrieval limit for this run, so those repos are explicitly marked as incomplete in the breakdown.

Data Collection Method
Date range: last 7 days relative to the current report date (2026-02-13).

PR identification:

Included PRs were those visible as merged/release merges into main (Mainder-API) and recently updated PRs (Skyline-v9) in the retrieved dataset.

Excluded PRs: open PRs or PRs outside the retrieved window, and any PRs in repos not retrieved (back-office, infojobs-workers).

Commit identification:

Included commits were the latest commits on Mainder-API main as returned by the commits listing (first page of recent history).

Direct commits vs PR commits: items with PR-style merge messages (e.g., “(#361)”) were treated as PR outcomes to avoid double-counting individual commits inside those merges.

Exclusions:

No attempt was made to enumerate staging/production/hotfix branches beyond what is represented by merges into main in the retrieved commit list.

Deduplication rule:

Where the same work appears repeated across multiple “promote staging to main / merge staging into main” release commits, it is consolidated into deliverables rather than counted as separate engineering outcomes.

Weekly Change Overview
Production-impacting changes (Mainder-API):

Candidate import pipeline for backoffice: models, async ingestion/jobs, API/policies/serializers, ZIP streaming limits, cross-tenant scoping safeguards, retry/cleanup logic, and blob purge/lock handling.

PreScreen MCP reliability and fallback behavior: stateless MCP endpoint, MCP tool auth hardening, error type definition, JSON content-type handling, fallback interview flow behavior, and observability logging.

Job approvals feature: schema/models/controllers/notifications/serializers/policies for approval-required job publishing flows.

Internal/preparatory work (Mainder-API):

Enrichment refactors and provider architecture: provider interfaces, Pearch-first strategy, reuse/selection logic, provider usage metrics completeness, cost analytics, and metrics endpoints.

PeopleFinder ops analytics alignment: cost ledger metrics fixes and caps to prevent >100% ratios.

Dependency/security updates: httparty and aws-sdk-s3 upgrades to address vulnerabilities.

Skyline-v9 (user-visible platform behavior):

Route-level loading UX standardization via Next.js loading.tsx, shared skeleton components, and consistency changes to spinners/skeletons; calendar channel fetch timeout/error/retry surfacing.

Concentration of work:

Most shipped scope clusters around reliability and correctness in async workflows (imports, automation/workflow execution timing, MCP session/auth resilience) and around operational analytics/cost observability (enrichment + PeopleFinder).

Repository Breakdown
Mainder-API
Key functional changes introduced:

Added a backoffice-facing candidate import pipeline, including batch/item concepts, async ingestion and processing jobs, and API surface to drive the workflow.

Added job-approval gating for job publish/open flows with approval requests/decisions, notifications (email/push), and serializer exposure of approval state.

Added Partners API Notes endpoints plus metadata (notes_count, latest_note) and eager-loading optimizations to reduce N+1 query patterns.

Infrastructure, data, or integration-related updates:

Hardened FullEnrich inputs (including required domain inference) and expanded enrichment provider abstractions (Pearch + internal reuse + FullEnrich fallback) with cost analytics and provider usage metrics.

Updated dependencies (httparty, aws-sdk-s3) for security reasons.

Areas of higher complexity or risk:

Candidate import reliability logic includes ZIP streaming, ActiveStorage blob lifecycle (purge rules), concurrency locks, retry partitioning, and hard/soft-delete cleanup order to avoid FK violations.

Job approval affects core job lifecycle state machine behavior (blocking open/publish without approvals), increasing risk of workflow regressions if policy/serializer/controller alignment drifts.

PreScreen MCP changes touch authentication, session resolution, and completion constraints (mandatory questions), which can impact agent-driven screening flows.

Skyline-v9
Frontend or platform-level changes:

Added multiple Next.js route-level loading.tsx fallbacks and introduced a shared skeleton system (primitives + compositions) to unify loading states.

Enabled experimental.webpackBuildWorker and added a check script combining lint + typecheck.

UX, flow, or behavior changes visible to users:

Loading behavior becomes more consistent across dashboard, lists, analytics, settings, and calendar views through skeleton-based placeholders and fade-in transitions (with motion-reduce guards).

Calendar channel loading gains explicit error surfacing, a 10s timeout for getChannels, and a retry mechanism exposed via boundary logic.

Architectural or structural modifications:

Introduced hardened calendar state management (channelsError, retryLoadChannels) and standardized skeleton configuration via shared counts/config structures.

MultipostingService

Back-Office
Activity was concentrated in a single release promotion on Feb 11 (PR #24) merging staging to main, plus direct commits on staging between Feb 10–11 . The work falls into four areas:

PeopleFinder operations UI overhaul

Surfaced AI Hunt source, failure reasons, and zero-cost diagnostics in the transaction detail view

Wired model-level KPI consumption to the new analytics contract from Mainder-API

Unified Ops navigation and centralized Pricing into a single section

Improved contextual flow between PeopleFinder sections

Fixed fallback and error context in transaction detail

Agencies management

Added advanced deletion cycle: preview → hard delete → polling for completion

Built a functional agency edit page with detail improvements

Improved agency list UX with loading states and creation feedback

Centralized error parsing across agency management screens

Hardened delete polling and reused platform URL normalization

Feature flags

Clarified effective state, origin, and inheritance display for per-agency feature flags

Fixed refresh of agency flags after removing overrides to keep effective state consistent

Aligned inherited default and added hunt query deep-link support

Dashboard & misc

Improved error states, feedback, and robustness across key dashboard modules

Clarified analytics labels to reduce confusion between technical and operational metrics

Simplified the credit adjustment dialog

Removed deprecated People Finder sidebar entry and improved navigation active state

Guarded save rate and AI empty-state edge cases in analytics

MultipostingService (infojobs-workers)
The most recent commit on main is dated Jan 20, 2026 (PR #28), which is outside the last-7-day window (Feb 6–13) . There was no new activity on main during this reporting week.

For completeness, the most recent changes shipped (Jan 16–20) included:

PR #28 – Replaced Playwright :has-text() with native JS querySelectorAll + find() in wait_for_function to fix a CSS selector syntax error in browser context

PR #27 – CV verification hardening after InfoJobs UI changes: tooltip dismissal, count-based verification fallback, En proceso tab support, and reprocess script for stuck candidates

PR #26 – Multiple reliability improvements: login retry logic (3-attempt with cookie handling), publish button fallback selectors, increased critical timeouts, and smart waiting for killer questions
