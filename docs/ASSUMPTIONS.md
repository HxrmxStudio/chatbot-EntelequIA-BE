# Assumptions

## 2026-02-09

1. **Service location override**: I implemented the dedicated WF1 backend in `/Users/user/Workspace/chatbot-EntelequIA-BE` because the latest execution request explicitly set this path as the new chatbot backend repository location. The older path `/Users/user/Workspace/chatbot-EntelequIA/chatbot-wf1-service` is treated as superseded for this run.
2. **Node runtime**: Local environment currently reports Node `v23.5.0`; the service is written to be compatible with Node 20 LTS and this remains the target runtime for deployment.
3. **Audit table**: The reusable schema file includes `users`, `conversations`, `messages`, `external_events`, and `outbox_messages` but no explicit `audit` table. I add and use an `audit_logs` table in this service migrations for required request auditability.

## 2026-02-11

1. **n8n Merge (Append) equivalence**: WF1 does not need an explicit merge step. The equivalent behavior is the `ContextBlock[]` composition in `enrich-context-by-intent` followed by `appendStaticContextBlock(...)` before LLM call. This preserves append semantics and deterministic order (`intent blocks` first, `static_context` last).
2. **Final output-stage mapping is functional, not node-literal**: `Extract Response`, `Save Messages`, `Audit Log`, `Check WhatsApp Channel`, `Queue WhatsApp`, and `HTTP Response` are mapped to existing BE orchestrators/repositories (use-case + adapters/repositories), preserving behavior without creating artificial n8n-style nodes.
3. **Trace idempotency integrity**: the fallback `externalEventId` candidate in trace scripts uses `request.rawBody` (not `request.body`) to stay aligned with controller/runtime behavior and avoid idempotency drift during diagnostics.
4. **Persistence policy by channel**: both `web` and `whatsapp` persist user+bot turns in `messages`. Only `whatsapp` enqueues `outbox_messages`; `web` never enqueues outbox.
5. **Stock visibility policy**: default disclosure is banded (`Sin stock`, `Quedan pocas unidades` for `1..3`, `Hay stock` for `>=4`). Exact stock number is disclosed only when user explicitly asks for quantity.
6. **Quality loop telemetry baseline**: runtime metadata stores `responsePolicyVersion`, `llmPath`, `fallbackReason`, token usage, `contextTypes`, and stock disclosure flags for later offline evaluation/HITL workflows.
