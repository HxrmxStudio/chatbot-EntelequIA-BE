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
- Success: `{ "ok": true, "message": "...", "conversationId": "...", "intent": "optional" }`
- Requires auth: `{ "ok": false, "requiresAuth": true, "message": "..." }`
- Failure: `{ "ok": false, "message": "..." }`

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
- Enforces JSON schema output and retries on transient/validation failures.
- Falls back to `{ intent: "general", confidence: 0.55, entities: [] }` when classification cannot be produced.
- Prompt source: `prompts/entelequia_intent_system_prompt_v1.txt`
- Schema source: `schemas/entelequia_intent_classification.schema.json`

## Entelequia backend mapping (strict)
Only these endpoints are used:
1. `GET /api/v1/products-list/{categorySlug?}`
2. `GET /api/v1/product/{idOrSlug}`
3. `GET /api/v1/products/recommended`
4. `GET /api/v1/cart/payment-info`
5. `GET /api/v1/account/orders`
6. `GET /api/v1/account/orders/{id}`

Forbidden endpoints are not used (`/api/v1/products`, `/chatbot/context`).

## Security
- DTO validation + sanitization
- Optional web signature (`x-webhook-secret`)
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
```
4. Build
```bash
npm run build
```
5. Run
```bash
npm run start:dev
```

## Key env vars
- `OPENAI_TIMEOUT_MS` (default `8000`): timeout in milliseconds for OpenAI requests.
- `CHATBOT_DB_TEST_URL` (optional): explicit DB URL for PostgreSQL integration tests (`test:integration:pg`).

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
