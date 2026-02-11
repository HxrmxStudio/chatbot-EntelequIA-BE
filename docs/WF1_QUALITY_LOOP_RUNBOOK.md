# WF1 Quality Loop v2 — Runbook Operativo y Guía de Medición

## 1) Objetivo
Este runbook describe cómo operar, medir y mejorar el loop de calidad de WF1 en producción sin romper el contrato público de `/wf1/chat/message`.

Incluye:
1. Qué señales genera WF1 en runtime.
2. Cómo correr los jobs batch (LLM-judge + HITL + retención + export).
3. Cómo medir calidad técnica y semántica.
4. Cómo actuar ante alertas y degradaciones.

---

## 2) Arquitectura funcional (resumen)
WF1 mantiene arquitectura:
`controllers -> use-cases -> ports -> adapters/repositories`

El loop de calidad usa tres capas:
1. **Online (runtime)**:
   - Persistencia de turnos (`messages`) y auditoría (`audit_logs`).
   - Metadata de calidad por respuesta (`llmPath`, `fallbackReason`, tokens, etc.).
   - Métricas Prometheus (`/internal/metrics`).
2. **Offline (batch)**:
   - Evaluación semántica con LLM-judge.
   - Cola HITL y revisión humana.
   - Cálculo de acuerdo (Cohen’s Kappa).
3. **Governance**:
   - Retención y pruning.
   - Export de dataset para tuning/few-shot.

---

## 3) Prerrequisitos
1. Migraciones SQL aplicadas:
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/01_initial_schema.sql`
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/02_audit_logs.sql`
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/03_fix_messages_event_dedupe.sql`
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/04_response_evaluations.sql`
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/05_hitl_review_queue.sql`
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/06_hitl_golden_examples.sql`
   - `/Users/user/Workspace/chatbot-EntelequIA-BE/sql/07_retention_policies.sql`
2. Variables de entorno configuradas (ver sección 4).
3. Servicio levantado con endpoint interno de métricas habilitado.

---

## 4) Variables de entorno clave
Referencia: `/Users/user/Workspace/chatbot-EntelequIA-BE/.env.example`

### 4.1 Evaluación semántica (Fase D)
1. `WF1_EVAL_ENABLED` (`true|false`)
2. `WF1_EVAL_MODEL` (default recomendado: `gpt-4o-mini`)
3. `WF1_EVAL_DAILY_CAP` (default recomendado: `200`)
4. `WF1_EVAL_TIMEOUT_MS` (default recomendado: `10000`)
5. `WF1_EVAL_SAMPLE_RANDOM_PERCENT` (default recomendado: `5`)
6. `WF1_EVAL_LOW_SCORE_THRESHOLD` (default recomendado: `0.6`)

### 4.2 HITL (Fase E)
1. `WF1_HITL_DAILY_CAP` (default recomendado: `50`)
2. `WF1_HITL_RANDOM_SAMPLE_CAP` (default recomendado: `5`)
3. `WF1_HITL_GOLDEN_COUNT` (default recomendado: `3`)

### 4.3 Retención (Fase G)
1. `WF1_RETENTION_MESSAGES_DAYS` (default: `90`)
2. `WF1_RETENTION_EVAL_DAYS` (default: `365`)
3. `WF1_RETENTION_HITL_DAYS` (default: `365`)

---

## 5) Operación online (runtime)

### 5.1 Persistencia esperada por canal
1. `web`: persiste `user + bot` en `messages`, **sin** `outbox_messages`.
2. `whatsapp`: persiste `user + bot` en `messages` y **sí** inserta `outbox_messages`.

Garantías detalladas:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/docs/IDEMPOTENCY_GUARANTEES.md`

### 5.2 Política de stock (v2-banded-stock)
1. `stock <= 0`: `Sin stock`
2. `1..3`: `Quedan pocas unidades`
3. `>=4`: `Hay stock`
4. Exacto (`En stock (N)`) solo ante pedido explícito del usuario.

Implementación:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/src/modules/wf1/domain/products-context/stock-visibility.ts`
- `/Users/user/Workspace/chatbot-EntelequIA-BE/src/modules/wf1/application/use-cases/enrich-context-by-intent/query-resolvers/resolve-stock-disclosure.ts`

---

## 6) Métricas runtime y alertas

### 6.1 Endpoint de métricas
```bash
curl -s http://localhost:3090/internal/metrics
```

Métricas mínimas:
1. `wf1_messages_total{source,intent,llm_path}`
2. `wf1_response_latency_seconds_bucket`
3. `wf1_fallback_total{reason}`
4. `wf1_stock_exact_disclosure_total`

### 6.2 Alertas Prometheus
Archivo:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/infra/prometheus/alerts.yml`

Reglas:
1. `Wf1HighFallbackRate` (critical)
2. `Wf1IntentHighLatency` (warning)
3. `Wf1HighExactStockRequests` (info)

Acciones:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/docs/WF1_OBSERVABILITY_RUNBOOK.md`

---

## 7) Jobs batch (cómo correrlos)
Todos los scripts generan reportes JSON en:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/docs/reports/local/`

### 7.1 Evaluación LLM-as-a-judge
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/evaluate-response-quality-llm-judge.ts`

Ejemplo:
```bash
WF1_EVAL_ENABLED=true npx ts-node --transpile-only scripts/evaluate-response-quality-llm-judge.ts
```

Comportamiento:
1. Respeta cap diario.
2. Prioriza `fallbacks` > `low-score` > `random`.
3. Timeout por evaluación: 10s.
4. Retry: 0 (batch no bloqueante).
5. Cache 24h por hash de input.

### 7.2 Encolar muestras HITL
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/enqueue-hitl-review-samples.ts`

Ejemplo:
```bash
npx ts-node --transpile-only scripts/enqueue-hitl-review-samples.ts
```

### 7.3 Revisar cola HITL (CLI)
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/review-hitl-queue.ts`

Listar pendientes:
```bash
npx ts-node --transpile-only scripts/review-hitl-queue.ts --limit 10
```

Enviar review:
```bash
npx ts-node --transpile-only scripts/review-hitl-queue.ts \
  --id <queue_id> \
  --reviewer <nombre_reviewer> \
  --quality good \
  --issues incomplete,off_topic \
  --corrected "Respuesta corregida"
```

### 7.4 Inyectar golden samples (calibración)
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/inject-golden-samples.ts`

Ejemplo:
```bash
npx ts-node --transpile-only scripts/inject-golden-samples.ts
```

### 7.5 Calcular acuerdo de reviewer (Cohen’s Kappa)
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/calculate-reviewer-agreement.ts`

Ejemplo:
```bash
npx ts-node --transpile-only scripts/calculate-reviewer-agreement.ts \
  --reviewer ana --days 30
```

Interpretación:
1. Objetivo: `kappa >= 0.7`
2. Alerta de recalibración: `kappa < 0.6`

### 7.6 Retención / pruning
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/prune-analytics-data.ts`

Dry-run (no borra):
```bash
npx ts-node --transpile-only scripts/prune-analytics-data.ts
```

Apply (borra):
```bash
npx ts-node --transpile-only scripts/prune-analytics-data.ts --apply
```

### 7.7 Export dataset para tuning
Script:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/export-training-dataset.ts`

Ejemplo:
```bash
npx ts-node --transpile-only scripts/export-training-dataset.ts --quality excellent,good --limit 1000
```

---

## 8) SQL de medición (KPIs)

### 8.1 Tasa de fallback (24h)
```sql
SELECT
  COALESCE(bot.metadata->>'fallbackReason', 'none') AS fallback_reason,
  COUNT(*)::int AS total
FROM messages bot
WHERE bot.sender = 'bot'
  AND bot.created_at >= now() - interval '24 hours'
GROUP BY 1
ORDER BY total DESC;
```

### 8.2 Distribución de `llmPath` (24h)
```sql
SELECT
  COALESCE(bot.metadata->>'llmPath', 'unknown') AS llm_path,
  COUNT(*)::int AS total
FROM messages bot
WHERE bot.sender = 'bot'
  AND bot.created_at >= now() - interval '24 hours'
GROUP BY 1
ORDER BY total DESC;
```

### 8.3 Latencia p50/p95 desde `audit_logs` (24h)
```sql
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
FROM audit_logs
WHERE created_at >= now() - interval '24 hours';
```

### 8.4 Ratio de disclosure exacto (24h)
```sql
SELECT
  SUM(CASE WHEN (bot.metadata->>'discloseExactStock')::boolean IS TRUE THEN 1 ELSE 0 END)::float
  / NULLIF(COUNT(*), 0) AS exact_disclosure_ratio
FROM messages bot
WHERE bot.sender = 'bot'
  AND bot.created_at >= now() - interval '24 hours';
```

### 8.5 Calidad semántica promedio (7d)
```sql
SELECT
  AVG(relevance) AS avg_relevance,
  AVG(completeness) AS avg_completeness,
  AVG(context_adherence) AS avg_context_adherence,
  AVG(role_adherence) AS avg_role_adherence,
  AVG(CASE WHEN hallucination_flag THEN 1 ELSE 0 END)::float AS hallucination_rate
FROM response_evaluations
WHERE created_at >= now() - interval '7 days';
```

### 8.6 Estado HITL pendiente
```sql
SELECT
  priority,
  COUNT(*)::int AS pending
FROM hitl_review_queue
WHERE reviewed_at IS NULL
GROUP BY priority
ORDER BY pending DESC;
```

---

## 9) Cadencia operativa recomendada

### Diario
1. Revisar alertas Prometheus.
2. Correr:
   - `evaluate-response-quality-llm-judge.ts`
   - `enqueue-hitl-review-samples.ts`
3. Revisar cola HITL y etiquetar pendientes críticos.

### Semanal
1. `inject-golden-samples.ts`
2. `calculate-reviewer-agreement.ts --reviewer <nombre> --days 30`
3. Revisar KPIs 7d y ajustar prompts/políticas.

### Mensual
1. `prune-analytics-data.ts` (dry-run y luego `--apply` si corresponde).
2. `export-training-dataset.ts` para dataset incremental.

---

## 10) Troubleshooting rápido

### Caso A: sube fallback ratio
1. Validar estado de OpenAI y cuota.
2. Revisar `fallbackReason` y `llmPath` en últimas 24h.
3. Verificar cambios recientes en prompts/context builders.
4. Si persiste >15 min, rollback.

### Caso B: sube latencia p95 por intent
1. Identificar intent afectado.
2. Revisar latencia de adapter externo (products/orders/payment/recommendations).
3. Revisar `context_size_exceeded` en logs.

### Caso C: muchas respuestas con stock exacto
1. Revisar queries disparadoras.
2. Ajustar patrones en `resolve-stock-disclosure.ts`.
3. Volver a correr unit + integration + e2e.

---

## 11) Verificación de integridad P3 (obligatoria)
El cálculo de `externalEventId` en traces debe usar `request.rawBody` para evitar drift con controller.

Archivo:
- `/Users/user/Workspace/chatbot-EntelequIA-BE/scripts/trace-wf1-up-to-output-validation.ts`

Chequeo rápido:
```bash
rg -n "computeExternalEventId|rawBody|request\\.body" scripts/trace-wf1-up-to-output-validation.ts
```

---

## 12) Contratos que NO cambian
1. Endpoint público: `POST /wf1/chat/message`
2. Shape `Wf1Response`: `ok`, `requiresAuth?`, `message`, `conversationId?`, `intent?`
3. No requiere cambios FE para operar este loop.

