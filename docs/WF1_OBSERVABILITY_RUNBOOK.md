# WF1 Observability Runbook

Documento principal operativo:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/docs/WF1_QUALITY_LOOP_RUNBOOK.md`

## Alert targets
Prometheus alerts are defined in `/Users/user/Workspace/chatbot-EntelequIA-BE/infra/prometheus/alerts.yml`.

Expected Alertmanager route:
- Slack webhook: `#entelequia-alerts`

## Alert actions

### 1) `Wf1HighFallbackRate` (critical)
1. Validate OpenAI status and API key/quota.
2. Check recent deploys in adapters: OpenAI, prompt templates, context builders.
3. Inspect `llmPath` / `fallbackReason` distribution in latest `audit_logs`.
4. If fallback persists >15 min, rollback to previous stable release.

### 2) `Wf1IntentHighLatency` (warning)
1. Identify affected `intent` label.
2. Inspect DB latency and external adapter latency (products/orders/payment/recommendations).
3. Check prompt/context size logs (`context_size_exceeded`).
4. Scale or rate-limit external calls if saturation is confirmed.

### 3) `Wf1HighExactStockRequests` (info)
1. Review queries that trigger exact stock disclosure.
2. Validate if stock band policy needs threshold tweak.
3. If needed, adjust `resolve-stock-disclosure` patterns and re-test.
