# WF1 Autonomous AI Execution Spec

Version: 1.0  
Date: 2026-02-09  
Owner role: Human manager (approval + prioritization only)  
Execution role: AI coding agents end-to-end

## 1. Mission

Migrate WF1 from N8N to a dedicated backend service with production parity and safe cutover.

Success means:

1. Widget web requests are handled by dedicated backend WF1.
2. Guest and authenticated flows work with real Entelequia BE endpoints.
3. Idempotency, persistence, and audit are preserved.
4. Rollback to N8N WF1 is immediate via feature flag.

## 2. Scope lock

In scope:

1. Dedicated backend WF1 service.
2. Web channel request/response contract.
3. Intent routing + context enrichment.
4. OpenAI orchestration.
5. DB writes (`users`, `conversations`, `messages`, `external_events`, `audit`).
6. Optional enqueue to `outbox_messages` when `source=whatsapp`.

Out of scope:

1. WF2 sender implementation.
2. WF3 retries implementation.
3. Full N8N decommission.

## 3. Repositories and roots

1. Frontend host: `/Users/user/Workspace/entelequia_tienda`
2. Widget + chatbot docs: `/Users/user/Workspace/chatbot-EntelequIA/chatbot-widget`
3. Existing business backend (Laravel): `/Users/user/Workspace/p-entelequia24`
4. New dedicated WF1 service (to create): `/Users/user/Workspace/chatbot-EntelequIA/chatbot-wf1-service`

## 4. Source-of-truth docs

Agents must read and obey:

1. `/Users/user/Workspace/entelequia_tienda/docs/wf1-dedicated-backend-migration-guide.md`
2. `/Users/user/Workspace/entelequia_tienda/docs/n8n-be-mapping-spec.md`
3. `/Users/user/Workspace/chatbot-EntelequIA/chatbot-widget/src/docs/N8N/wf1_main_webhook.md`
4. `/Users/user/Workspace/p-entelequia24/routes/api.php`

If a conflict exists:

1. Real backend routes/code override narrative docs.
2. Mapping spec in `entelequia_tienda/docs` overrides older N8N docs.

## 5. Mandatory technical decisions

1. Language: TypeScript strict.
2. Framework: NestJS.
3. Runtime: Node.js 20 LTS.
4. DB: PostgreSQL using existing chatbot schema.
5. HTTP client: native `fetch` or `undici`, with typed wrappers.
6. Validation: `class-validator` + `class-transformer`.
7. Testing: Vitest or Jest (unit + integration), plus API e2e.

## 6. Fixed contracts

## 6.1 Inbound request DTO

```json
{
  "source": "web|whatsapp",
  "userId": "string<=255",
  "conversationId": "string<=255",
  "text": "string 1..4096 (post-sanitize)",
  "accessToken": "string optional",
  "currency": "ARS|USD optional",
  "locale": "es-AR optional"
}
```

### 6.2 Response union

Success:

```json
{ "ok": true, "message": "string", "conversationId": "string", "intent": "string optional" }
```

Requires auth:

```json
{ "ok": false, "requiresAuth": true, "message": "string" }
```

Failure:

```json
{ "ok": false, "message": "string" }
```

## 7. Required backend endpoint mapping

Use only real endpoints:

1. Product search: `GET /api/v1/products-list/{categorySlug?}`
2. Product detail: `GET /api/v1/product/{idOrSlug}`
3. Recommendations: `GET /api/v1/products/recommended`
4. Payment info: `GET /api/v1/cart/payment-info`
5. Orders list (auth): `GET /api/v1/account/orders`
6. Order detail (auth): `GET /api/v1/account/orders/{id}`

Never call:

1. `GET /api/v1/products` (invalid public route).
2. `POST /chatbot/context` (not implemented in Laravel).

## 8. Error mapping rules (non-negotiable)

1. Missing auth for order intent -> `ok=false`, `requiresAuth=true`.
2. BE 401 -> `ok=false`, `requiresAuth=true`.
3. BE 403 -> `ok=false` with safe permission message.
4. BE 442 -> `ok=false` with safe ownership message.
5. BE 404 -> `ok=false` not found message.
6. BE 5xx/timeout/network -> `ok=false` generic fallback.
7. Validation errors -> HTTP 400 with safe message.

## 9. Security controls

1. Validate all inbound payloads.
2. Sanitize `text` before intent and LLM.
3. Do not log full access tokens.
4. Restrict CORS to approved frontend origins.
5. Support optional `x-webhook-secret` validation.
6. Keep secrets server-side only.
7. Emit audit record for each handled request.

## 10. Data persistence requirements

Minimum write/read behavior:

1. Upsert user by `userId`.
2. Upsert conversation by `conversationId`.
3. Insert user message and assistant message.
4. Enforce idempotency by `external_events` unique key.
5. Write audit row for success/failure.

Optional in phase 1:

1. Insert outbox record when `source=whatsapp`.

## 11. AI execution protocol

Agents must execute phases in order and do not skip acceptance gates.

## 11.1 Phase A - Bootstrap service

Tasks:

1. Create NestJS service in `/Users/user/Workspace/chatbot-EntelequIA/chatbot-wf1-service`.
2. Configure TypeScript strict, lint, test, format.
3. Add env config module + validation.
4. Add health endpoint.

Acceptance gate:

1. Service boots locally.
2. `GET /health` returns 200.

### 11.2 Phase B - WF1 core API

Tasks:

1. Implement `POST /wf1/chat/message` controller.
2. Add DTO validation and sanitizer.
3. Add signature validation middleware/guard.
4. Implement request ID propagation.

Acceptance gate:

1. Valid payload accepted.
2. Invalid payload rejected with 400.

### 11.3 Phase C - Persistence and idempotency

Tasks:

1. Add repositories for users/conversations/messages/external_events/audit.
2. Implement idempotency check and insert.
3. Wrap critical writes in transaction.

Acceptance gate:

1. Duplicate external event does not duplicate message writes.
2. Audit row created for each handled call.

### 11.4 Phase D - Intent and context enrichment

Tasks:

1. Implement intent extractor service.
2. Implement switch/router by intent.
3. Implement Entelequia BE adapter with typed clients.
4. Normalize context blocks for LLM.

Acceptance gate:

1. Product intent hits `/products-list`.
2. Order intent requires token and calls `/account/orders` when present.

### 11.5 Phase E - LLM orchestration and response mapping

Tasks:

1. Implement OpenAI adapter.
2. Build final prompt from message + history + context blocks.
3. Implement strict response mapping to union contract.

Acceptance gate:

1. Contract-compliant JSON always returned.
2. No stack trace or secret leaks in response body.

### 11.6 Phase F - Feature flag, shadow mode, cutover

Tasks:

1. Add provider flag in frontend/widget integration: `n8n|dedicated`.
2. Implement shadow mode path for comparison.
3. Add canary support by percentage.

Acceptance gate:

1. Rollback to N8N is config-only and immediate.

## 12. Required project structure

```text
chatbot-wf1-service/
  src/
    main.ts
    app.module.ts
    modules/
      wf1/
        wf1.module.ts
        controllers/chat.controller.ts
        dto/chat-request.dto.ts
        dto/chat-response.dto.ts
        application/use-cases/handle-incoming-message.use-case.ts
        application/ports/*.ts
        domain/*.ts
        infrastructure/adapters/*.ts
        infrastructure/repositories/*.ts
        infrastructure/security/*.ts
  test/
  .env.example
  package.json
  README.md
```

## 13. Required env vars

```env
NODE_ENV=development
PORT=3090

CHATBOT_DB_URL=postgresql://user:pass@host:5432/chatbot

ENTELEQUIA_API_BASE_URL=https://entelequia.com.ar/api/v1
ENTELEQUIA_API_TIMEOUT_MS=8000

OPENAI_API_KEY=...
OPENAI_MODEL=...

WEBHOOK_SECRET=
ALLOWED_ORIGINS=https://entelequia.com.ar,http://localhost:5182
```

## 14. Test specification

Minimum test matrix:

1. `guest product search` -> success.
2. `guest order status` -> requiresAuth.
3. `logged order status valid` -> success.
4. `logged order not owned` (442) -> safe business error.
5. `invalid payload` -> 400.
6. `duplicate external event` -> idempotent.
7. `backend timeout` -> generic fallback.

Coverage target:

1. Core WF1 use case >= 80% line coverage.

## 15. Observability requirements

Must emit:

1. request count.
2. error count.
3. latency p50/p95.
4. intent distribution.
5. requiresAuth rate.

Structured log fields:

1. `requestId`
2. `conversationId`
3. `intent`
4. `status`
5. `latencyMs`

## 16. Frontend/widget integration tasks for AI

1. Add dedicated provider target in widget config.
2. Ensure host provides `userId`, `accessToken`, `currency`.
3. Stop widget internal token key dependence (host is source of truth).
4. Keep response contract compatibility with existing UI behavior.

## 17. Delivery artifacts expected from AI agents

1. Working service code in new repo/folder.
2. Migration notes in `README.md`.
3. API collection examples (curl/http files).
4. Test suite and report.
5. Cutover/rollback runbook.
6. Changelog of parity differences vs N8N WF1.

## 18. Done criteria (manager approval checklist)

1. All phase gates passed.
2. Real endpoint mapping validated against Laravel routes.
3. Guest + auth flows validated end-to-end.
4. Error mapping 401/403/442 verified.
5. Shadow comparison acceptable.
6. Canary + rollback tested.

## 19. Decision policy for autonomous AI

When uncertain, AI must prefer:

1. Existing backend code over documentation assumptions.
2. Safer behavior over clever behavior.
3. Explicit mapping over inferred mapping.
4. Backward-compatible contracts over breaking changes.

If blocked by missing information:

1. Proceed with conservative default.
2. Log assumption in code comments and migration notes.
3. Keep behavior switchable by feature flag.

