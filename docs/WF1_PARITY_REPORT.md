# WF1 Parity Report (N8N vs Dedicated Backend)

Date: 2026-02-09

## Fully matched behavior
1. Inbound contract preserved (`source`, `userId`, `conversationId`, `text`, optional `accessToken`, `currency`, `locale`).
2. Response union preserved:
   - `ok=true` success
   - `ok=false, requiresAuth=true`
   - `ok=false` generic failure
3. Signature checks implemented:
   - Web: `x-turnstile-token` verification (when `TURNSTILE_SECRET_KEY` is configured)
   - WhatsApp: `x-hub-signature-256` HMAC (optional by env)
4. Idempotency via `external_events` unique key (`source`, `external_event_id`).
5. Persistence minimum covered:
   - `users` upsert
   - `conversations` upsert
   - `messages` (user + bot)
   - `external_events`
   - `audit_logs` (service-owned table)
   - `outbox_messages` insert for `source=whatsapp`
6. Intent enrichment uses only allowed Laravel endpoints:
   - `GET /api/v1/products-list/{categorySlug?}`
   - `GET /api/v1/product/{idOrSlug}`
   - `GET /api/v1/products/recommended`
   - `GET /api/v1/cart/payment-info`
   - `GET /api/v1/account/orders`
   - `GET /api/v1/account/orders/{id}`
7. Error mapping parity implemented:
   - Missing order auth => `requiresAuth=true`
   - 401 => `requiresAuth=true`
   - 403 => safe permission message
   - 442 => safe ownership message
   - 404 => not-found message
   - 5xx/timeout/network => generic fallback
   - invalid payload => HTTP 400

## Final output stage mapping (legacy n8n -> dedicated BE)

| Legacy stage | Dedicated BE equivalent |
| --- | --- |
| Extract Response | `OpenAiAdapter` (structured/legacy path) + `fallback-builder` |
| Save Messages | `PgChatRepository.persistTurn()` |
| Audit Log | `PgAuditRepository.writeAudit()` |
| Check WhatsApp Channel | branch by `payload.source` in use-case/repository |
| Queue WhatsApp | `outbox_messages` insert in the same transaction as message persistence |
| HTTP Response | `Wf1Response` returned from `HandleIncomingMessageUseCase` via controller |

Final-stage execution order is intentionally explicit in BE orchestration:
1. `enrichContextByIntent(...)`
2. `appendStaticContextBlock(...)`
3. `llmPort.buildAssistantReply(...)`
4. `chatPersistence.persistTurn(...)` (and queue outbox for `source=whatsapp`)
5. `idempotencyPort.markProcessed(...)`
6. `auditPort.writeAudit(...)`
7. Return `Wf1Response`

## Controlled differences
1. `audit_logs` table added in dedicated service because reusable schema did not include explicit audit table.
2. Idempotency key source:
   - Preferred: `x-external-event-id`/`x-idempotency-key`
   - Fallback: SHA-256 from raw body (documented conservative behavior).
3. Intent extraction is deterministic rule-based in-service (N8N had tool node chain).
4. LLM adapter falls back to safe templated response if OpenAI is unavailable or key is missing.
5. n8n `Merge (Append)` is represented by `ContextBlock[]` composition + `appendStaticContextBlock(...)`, no dedicated merge node.
6. Stock exposure is policy-driven in BE (`v2-banded-stock`): exact inventory is not shown by default and is disclosed only on explicit user request.

## Widget/host migration parity
1. Widget payload remains backward compatible and now also forwards optional `currency` + `locale`.
2. Widget no longer depends on an internal fixed token key as primary source; it consumes host context provider with legacy fallback.
3. Provider flag/canary/shadow mode added for rollout and rollback control.

## Non-regression checks executed
1. Service build + lint + unit/integration/e2e tests.
2. Widget type-check + build.
3. Frontend host build.

## Trace integrity note (P3)
`scripts/trace-wf1-up-to-output-validation.ts` computes fallback idempotency hash from `request.rawBody` (not `request.body`) to match controller behavior and avoid trace/prod drift.

## Quality loop extensions (BE-native)
1. Internal metrics endpoint: `GET /internal/metrics` with Prometheus exposition.
2. New analytics tables:
   - `response_evaluations`
   - `hitl_review_queue`
   - `hitl_golden_examples`
3. Outbox idempotency guarantees are documented in `docs/IDEMPOTENCY_GUARANTEES.md`.
