# Chatbot WF1 Dedicated Backend (NestJS)

Dedicated backend service for WF1 migration from N8N with functional parity, idempotency, audit, and controlled rollback.

## Stack
- Node.js 20 LTS target runtime
- TypeScript strict
- NestJS
- PostgreSQL (`users`, `conversations`, `messages`, `external_events`, `outbox_messages` + `audit_logs`)
- DTO validation with `class-validator`
- Unit + integration + e2e API tests

## Implemented endpoint
- `POST /wf1/chat/message`
- `POST /wf1/chat/feedback`
- `POST /api/v1/chat/intent`
- `GET /health`

## WF1 contract
### Request
```json
{
  "source": "web|whatsapp",
  "userId": "string<=255",
  "conversationId": "string<=255",
  "text": "string",
  "accessToken": "optional",
  "currency": "ARS|USD optional",
  "locale": "es-AR optional"
}
```

### Response union
- Success: `{ "ok": true, "message": "...", "conversationId": "...", "intent": "optional", "responseId": "optional", "ui": "optional" }`
- Requires auth: `{ "ok": false, "requiresAuth": true, "message": "..." }`
- Failure: `{ "ok": false, "message": "..." }`

### Feedback request
```json
{
  "source": "web",
  "conversationId": "string<=255",
  "responseId": "uuid",
  "rating": "up|down",
  "reason": "optional<=280",
  "category": "accuracy|relevance|tone|ux|other optional"
}
```

### Feedback response
```json
{
  "ok": true
}
```

## Intent node contract
### Request
```json
{
  "text": "string",
  "source": "optional",
  "userId": "optional",
  "conversationId": "optional",
  "requestId": "optional"
}
```

### Response
```json
{
  "intent": "products|orders|tickets|store_info|payment_shipping|recommendations|general",
  "confidence": 0.0,
  "entities": ["string"]
}
```

Behavior:
- Uses OpenAI Responses API (`gpt-4o-mini`) with system+user messages.
- Uses `max_output_tokens=150`, `temperature=0.2` and `verbosity=medium`.
- Enforces JSON schema output and retries on transient/validation failures.
- Falls back to `{ intent: "general", confidence: 0.55, entities: [] }` when classification cannot be produced.
- Prompt source: `prompts/system/entelequia_intent_system_prompt_v1.txt`
- Schema source: `schemas/entelequia_intent_classification.schema.json`

## Entelequia backend mapping (strict)
Only these endpoints are used:
1. `GET /api/v1/products-list/{categorySlug?}`
2. `GET /api/v1/product/{idOrSlug}`
3. `GET /api/v1/products/recommended`
4. `GET /api/v1/cart/payment-info`
5. `GET /api/v1/account/orders`
6. `GET /api/v1/account/orders/{id}`
7. `POST /api/v1/bot/order-lookup` (HMAC signed; guest order verification)

Forbidden endpoints are not used (`/api/v1/products`, `/chatbot/context`).

## Security
- DTO validation + sanitization
- Optional web anti-bot verification (`x-turnstile-token`)
- Optional WhatsApp signature (`x-hub-signature-256`)
- Request ID propagation (`x-request-id`)
- Access tokens are never logged in full
- CORS restricted by `ALLOWED_ORIGINS`

## Persistence behavior
- `users` upsert
- `conversations` upsert
- `messages` insert (user + bot)
- `external_events` idempotency
- `audit_logs` insert per handled request
- `outbox_messages` insert when `source=whatsapp`

## Error mapping
- Missing auth in order intent => `requiresAuth=true`
- Backend 401 => `requiresAuth=true`
- Backend 403 => safe permission message
- Backend 442 => safe ownership message
- Backend 404 => not-found message
- Backend 5xx/timeout/network => generic fallback
- Invalid payload => HTTP 400
- Guest order lookup (`/bot/order-lookup`) statuses:
  - `200` => deterministic order status response
  - `404` => verification failed (without exposing which field failed)
  - `422` => ask user to complete or correct data
  - `401` => one automatic retry with new timestamp/nonce/signature, then safe temporary-error message
  - `429` => retry/backoff controlled by env and safe high-demand message

## Local setup
1. Install deps
```bash
npm install
```
2. Copy envs
```bash
cp .env.example .env
```
3. Apply SQL schema (base + incremental fix)
```bash
psql "$CHATBOT_DB_URL" -f sql/01_initial_schema.sql
psql "$CHATBOT_DB_URL" -f sql/02_audit_logs.sql
psql "$CHATBOT_DB_URL" -f sql/03_fix_messages_event_dedupe.sql
psql "$CHATBOT_DB_URL" -f sql/04_response_evaluations.sql
psql "$CHATBOT_DB_URL" -f sql/05_hitl_review_queue.sql
psql "$CHATBOT_DB_URL" -f sql/06_hitl_golden_examples.sql
psql "$CHATBOT_DB_URL" -f sql/07_retention_policies.sql
psql "$CHATBOT_DB_URL" -f sql/08_message_feedback.sql
psql "$CHATBOT_DB_URL" -f sql/09_wf1_learning_runs.sql
psql "$CHATBOT_DB_URL" -f sql/10_wf1_intent_exemplars.sql
psql "$CHATBOT_DB_URL" -f sql/11_conversations_status_ttl_indexes.sql
```
4. Build
```bash
npm run build
```
5. Run
```bash
npm run start:dev
```

## Local full stack launcher
To run Entelequia FE + Chatbot BE + Entelequia BE together for local E2E testing:

```bash
chmod +x scripts/run-entelequia-local-stack.sh
scripts/run-entelequia-local-stack.sh up
```

Common commands:

```bash
scripts/run-entelequia-local-stack.sh status
scripts/run-entelequia-local-stack.sh logs chatbot
scripts/run-entelequia-local-stack.sh logs all
scripts/run-entelequia-local-stack.sh logs entelequia
scripts/run-entelequia-local-stack.sh down
```

`status` now includes `chatbot widget csp: ok|mismatch` to quickly detect iframe CSP drift.

Defaults (overridable by env vars):
- FE repo: `/Users/user/Workspace/entelequia_tienda` (port `5173`)
- Chatbot BE repo: `/Users/user/Workspace/chatbot-EntelequIA-BE` (port `3090`)
- Entelequia BE repo: `/Users/user/Workspace/p-entelequia24` (port `8010`)
- Chatbot upstream API for catalog/context: `https://entelequia.com.ar`
- Default script log target: `chatbot`
- Runtime files/logs: `/tmp/entelequia-local-stack`

Run local stack with production read-only upstream for chatbot (recommended):

```bash
CHATBOT_ENTELEQUIA_BASE_URL=https://entelequia.com.ar \
scripts/run-entelequia-local-stack.sh up
```

Switch chatbot upstream to local Entelequia BE for debugging:

```bash
CHATBOT_ENTELEQUIA_BASE_URL=http://127.0.0.1:8010 \
scripts/run-entelequia-local-stack.sh up
```

### CORS debug quick runbook
1. Confirm chatbot instance, logs and widget CSP status:
```bash
scripts/run-entelequia-local-stack.sh status
scripts/run-entelequia-local-stack.sh logs chatbot
```
2. If `chatbot widget csp: mismatch`, rebuild/sync widget for local mode:
```bash
cd /Users/user/Workspace/chatbot-EntelequIA/chatbot-widget
npm run build:skip-checks -- --mode development
cd /Users/user/Workspace/entelequia_tienda
npm run sync:chatbot-widget
```
3. Verify preflight from FE origin:
```bash
curl -si -X OPTIONS http://127.0.0.1:3090/wf1/chat/message \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Access-Control-Request-Method: POST'
```
4. Confirm FE target URL:
- `VITE_CHATBOT_WEBHOOK_URL` should point to `http://127.0.0.1:3090/wf1/chat/message` in local mode.

Behavior:
- Development/test: permissive CORS for local diagnostics.
- Production: strict allowlist, `ALLOWED_ORIGINS` required at startup.

## Key env vars
- `OPENAI_TIMEOUT_MS` (default `8000`): timeout in milliseconds for OpenAI requests.
- `CHATBOT_DB_IP_FAMILY` (optional): force DB DNS family (`4` or `6`) for environments with IPv6 routing issues (useful in CI).
- `ENTELEQUIA_BASE_URL` (recommended): Entelequia base URL. If empty, falls back to `ENTELEQUIA_API_BASE_URL`.
- `CHATBOT_ENTELEQUIA_BASE_URL` (stack script runtime): upstream API used when launching local stack; default `https://entelequia.com.ar`.
- `BOT_ORDER_LOOKUP_HMAC_SECRET`: shared secret for HMAC signing in `/api/v1/bot/order-lookup`.
- `BOT_ORDER_LOOKUP_TIMEOUT_MS` (default `8000`): timeout for secure order lookup requests.
- `BOT_ORDER_LOOKUP_RETRY_MAX` (default `1`): max retries for `429` responses.
- `BOT_ORDER_LOOKUP_RETRY_BACKOFF_MS` (default `500`): base backoff for `429` retries.
- `WF1_CONVERSATION_ACTIVE_TTL_MINUTES` (default `1440`): TTL in minutes before auto-closing stale active conversations.
- `WF1_CONVERSATION_CLOSER_ENABLED` (default `true`): enables scheduled stale conversation closer job.
- `WF1_RECURSIVE_LEARNING_ENABLED` (default `true`): enables adaptive exemplar hints.
- `WF1_RECURSIVE_AUTOPROMOTE_ENABLED` (default `true`): enables automatic promotion of feedback exemplars in the weekly loop.
- `WF1_RECURSIVE_AUTO_ROLLBACK_ENABLED` (default `false`): rollback remains manual by default.
- `WF1_LEARNING_SEED_FILE` (default `docs/qa/learning-seed-cases.jsonl`): QA seed dataset used by bootstrap script.

## Operations checks
```bash
npm run db:migration:status
npm run wf1:conversations:close-stale
npm run wf1:telemetry:verify
npm run wf1:learning:bootstrap-seeds
npm run wf1:learning:validate-seeds
npm run wf1:learning:build
```

## Canonical business prompts
- Canonical source file: `prompts/static/entelequia_business_context_canonical_v1.yaml`.
- Generated targets:
  - `prompts/static/entelequia_static_context_v1.txt`
  - `prompts/static/entelequia_critical_policy_context_v1.txt`
  - `prompts/tickets/entelequia_tickets_returns_policy_context_v1.txt`
  - `prompts/payment-shipping/entelequia_payment_shipping_general_context_v1.txt`

Commands:
```bash
npm run prompts:generate:entelequia
npm run prompts:validate:entelequia
```

## GitHub Actions DB connectivity note
- `db.<project-ref>.supabase.co` can resolve only IPv6 in some setups.
- For GitHub runners without IPv6 route, provide an IPv4-capable connection URL in secret `CHATBOT_DB_URL_IPV4`.
- The workflow now falls back automatically: `CHATBOT_DB_URL_IPV4 || CHATBOT_DB_URL`.

## Production upstream guardrails
- In local E2E mode, chatbot requests to production Entelequia are read-only (catalog/context GET endpoints).
- Do not log full tokens, secrets, signatures or full PII values.
- Keep conservative timeout/retry settings to avoid flooding upstream.

## Tests
```bash
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:integration -- --runInBand --testPathPattern=pg-wf1.repository.integration.spec.ts
```

## Feature flags for cutover/rollback (widget/host)
Set in frontend/widget env:
- `VITE_CHAT_WF1_PROVIDER=n8n|dedicated`
- `VITE_CHAT_WF1_CANARY_PERCENT=0..100`
- `VITE_CHAT_WF1_SHADOW_MODE=true|false`
- `VITE_DEDICATED_WF1_WEBHOOK_URL=http://.../wf1/chat/message`
- `VITE_N8N_WEBHOOK_URL=https://...`

Rollback is config-only by setting `VITE_CHAT_WF1_PROVIDER=n8n`.

Detailed steps: `ROLLBACK_RUNBOOK.md`.

## Migration docs
- `WF1_PARITY_REPORT.md`
- `ASSUMPTIONS.md`
- `ROLLBACK_RUNBOOK.md`
- `sql/02_audit_logs.sql`
- `sql/03_fix_messages_event_dedupe.sql`
