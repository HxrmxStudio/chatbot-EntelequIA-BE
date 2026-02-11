# WF1 Quality Loop v2 (Operational Notes)

## Scope
This document describes the BE-native quality loop introduced after the WF1 migration. It is intentionally architecture-aligned (use-cases, ports, adapters, repositories), not a literal n8n node translation.

Operational runbook (primary reference):
- `/Users/user/Workspace/chatbot-EntelequIA-BE/docs/WF1_QUALITY_LOOP_RUNBOOK.md`

## Runtime signals
WF1 persists response-quality metadata on each turn:
- `responsePolicyVersion`
- `llmPath`
- `fallbackReason`
- `promptVersion`
- `inputTokenCount`, `outputTokenCount`, `cachedTokenCount`
- `contextTypes`
- `discloseExactStock`, `lowStockThreshold`
- `traceId`, `spanId`, `sessionId`

## Prometheus
- Endpoint: `GET /internal/metrics`
- Alerts file: `infra/prometheus/alerts.yml`
- Runbook: `docs/WF1_OBSERVABILITY_RUNBOOK.md`
- Core metrics:
  - `wf1_messages_total{source,intent,llm_path}`
  - `wf1_response_latency_seconds_*`
  - `wf1_fallback_total{reason}`
  - `wf1_stock_exact_disclosure_total`

## Batch scripts
1. `scripts/evaluate-response-quality-llm-judge.ts`
2. `scripts/enqueue-hitl-review-samples.ts`
3. `scripts/review-hitl-queue.ts`
4. `scripts/inject-golden-samples.ts`
5. `scripts/calculate-reviewer-agreement.ts`
6. `scripts/prune-analytics-data.ts`
7. `scripts/export-training-dataset.ts`

## SQL assets
1. `sql/04_response_evaluations.sql`
2. `sql/05_hitl_review_queue.sql`
3. `sql/06_hitl_golden_examples.sql`
4. `sql/07_retention_policies.sql`

## Defaults
- LLM-as-a-judge model: `gpt-4o-mini`
- Daily eval cap: `200`
- Judge timeout: `10s`
- Judge retry: `0` (batch only)
- Messages retention: `90d`
- Evaluation/HITL retention: `365d`
