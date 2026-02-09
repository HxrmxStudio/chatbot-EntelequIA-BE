Dale. Te dejo un **SPEC de backend** para reemplazar el nodo **“Extract Intent”** (y que sea drop-in para el resto del flujo), con contrato, validación estricta, retries y fallback.

---

# SPEC — Intent Classification Service (Extract Intent)

## 0) Objetivo

Reemplazar el nodo n8n **OpenAI Chat → Message a Model** llamado **“Extract Intent”** por un servicio backend que:

- Reciba `text` (equivalente a `Webhook.body.text`).
- Devuelva **SIEMPRE** JSON válido con el shape:
  - `intent` (enum)
  - `confidence` (number)
  - `entities` (string[])

- Use el mismo **System Prompt** y el mismo **JSON Schema** del nodo.
- Tenga **retry on fail** y **fallback** determinístico.

---

## 1) Contrato del endpoint

### 1.1 HTTP Endpoint

- **Method:** `POST`
- **Path:** `/api/v1/chat/intent` _(ajustable; recomendación para separar de “chat main”)_

### 1.2 Request Body (mínimo)

```json
{
  "text": "string",
  "source": "web|whatsapp|telegram|... (opcional)",
  "userId": "string (opcional)",
  "conversationId": "string (opcional)",
  "requestId": "string (opcional)"
}
```

**Notas:**

- Para replicar n8n 1:1, lo único requerido es `text`.
- El resto te sirve para logging/tracing/idempotencia.

### 1.3 Response 200 (siempre que no sea error fatal de API gateway)

```json
{
  "intent": "products|orders|tickets|store_info|payment_shipping|recommendations|general",
  "confidence": 0.0,
  "entities": ["string"]
}
```

### 1.4 Errores

**Recomendación práctica (para “Always Output Data”):**

- Evitar 4xx/5xx por problemas del modelo y devolver fallback 200.
- Solo devolver 4xx si el request está roto (p.ej. `text` no string / vacío) y vos querés “hard fail”. En n8n normalmente esto se valida antes.

**Opción A (preferida, estilo n8n):**

- `422` si `text` falta o no es string
- todo lo demás → fallback 200

---

## 2) Taxonomía y reglas

### 2.1 Enum de intents

- `products`
- `orders`
- `tickets`
- `store_info`
- `payment_shipping`
- `recommendations`
- `general`

### 2.2 Heurística mínima (solo para fallback)

Si el modelo falla y tenés que inferir:

- `intent: "general"`
- `confidence: 0.55`
- `entities: []`

_(Esto refleja el ejemplo del prompt: “Necesito ayuda” → general con ~0.55.)_

---

## 3) Prompt (fuente de verdad)

### 3.1 System Prompt

- Debe ser **idéntico** al del nodo (texto completo).
- Guardarlo versionado en repo:
  - `prompts/entelequia_intent_system_prompt_v1.txt`

- Exponer versión en logs/metadata:
  - `prompt_version = "v1"`

### 3.2 User Prompt

- Debe ser el `text` entrante tal cual:
  - `user_message = req.body.text`

### 3.3 Sanitización de input

- Trim opcional: `text.trim()`
- Limitar longitud para costos / latencia:
  - `max_input_chars = 4000` (recomendado)
  - Si excede: truncar y loggear `truncated=true`

---

## 4) Response format / Schema (idéntico al nodo)

### 4.1 JSON Schema (exacto)

```json
{
  "type": "object",
  "properties": {
    "intent": {
      "type": "string",
      "enum": [
        "products",
        "orders",
        "tickets",
        "store_info",
        "payment_shipping",
        "recommendations",
        "general"
      ]
    },
    "confidence": { "type": "number" },
    "entities": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["intent", "confidence", "entities"],
  "additionalProperties": false
}
```

### 4.2 Validación runtime

- Validar response del modelo contra este schema.
- Si trae campos extra → **rechazar y reintentar** (o “strip & accept”; recomendación: rechazar para ser fiel).
- `confidence`:
  - Aceptar number, luego clamp: `0..1` (opcional pero recomendable)

- `entities`:
  - Asegurar array de strings
  - Normalizar: trim, dedupe, remover vacíos

---

## 5) Integración OpenAI (equivalente al nodo)

### 5.1 Modelo

- `gpt-4o-mini`

### 5.2 Parámetros (fiel al nodo)

- **temperature:** no seteado (usar default)
- **max_tokens:** no seteado
- **top_p:** no seteado
- **verbosity:** `medium` _(si tu SDK lo soporta; sino omití)_

### 5.3 Modo “JSON Schema”

- Nombre: `entelequia_intent_classification`
- Schema: el de arriba
- Strict: **false** (igual que n8n)

> En OpenAI Responses API esto suele mapear a `response_format: { type: "json_schema", json_schema: { name, schema, strict } }`.

---

## 6) Retries & resiliencia (replica “Retry On Fail”)

### 6.1 Cuándo reintentar

Reintentar si:

- Error transitorio HTTP (429/500/502/503/504)
- Timeout
- No parsea JSON
- JSON no valida contra schema

No reintentar si:

- 401/403 (credenciales)
- 400 (request malformado a OpenAI)
- input inválido (text vacío) → 422

### 6.2 Estrategia

- `max_attempts = 3` _(n8n lo deja vacío, pero vos lo definís)_
- Backoff exponencial con jitter:
  - base 250ms, factor 2, jitter ±20%
  - Ejemplo: 250ms → 500ms → 1000ms

### 6.3 Fallback final

Si tras `max_attempts` no hay respuesta válida:

```json
{ "intent": "general", "confidence": 0.55, "entities": [] }
```

y log `fallback=true` + `reason`.

---

## 7) Observabilidad (imprescindible para migración)

### 7.1 Logs estructurados

Campos recomendados:

- `request_id` (si viene; sino generar UUID)
- `conversation_id`, `user_id`, `source`
- `model = "gpt-4o-mini"`
- `prompt_version = "v1"`
- `attempts`
- `latency_ms`
- `token_usage` (si SDK lo da)
- `fallback` boolean + `fallback_reason`
- `validation_error` si aplica

### 7.2 Métricas

- `intent_classification_requests_total`
- `intent_classification_fallback_total`
- `intent_classification_retry_total`
- Latencia P50/P95
- Distribución intents (por `source`)

---

## 8) Seguridad & compliance

- No loggear texto completo en producción (o hacerlo con redacción):
  - `text_hash` (sha256) + `text_len`

- Rate limit por `source` / `ip` / `userId` (según tu esquema)
- Timeouts:
  - upstream OpenAI: 10–15s max

- Circuit breaker opcional si OpenAI está caído

---

## 9) Tests (mínimos)

### 9.1 Unit tests

- Valida schema y rechaza additionalProperties
- Dedupe y trimming de entities
- Clamp de confidence si viene >1 o <0

### 9.2 Contract tests (golden)

Casos del prompt:

- `"Hola, ¿tienen el tomo 33 de One Piece?"` → products, entities incluye One Piece + tomo 33
- `"¿Cuándo llega mi pedido? Soy de zona norte"` → orders
- `"El manga llegó con las páginas dobladas"` → tickets
- `"¿Dónde están ubicados? ¿Qué horario tienen?"` → store_info
- `"¿Aceptan Mercado Pago? ¿Hacen envíos a Córdoba?"` → payment_shipping
- `"Quiero empezar a leer manga de acción"` → recommendations
- `"Necesito ayuda"` → general y confidence < 0.7 (ideal)

### 9.3 Chaos tests (resiliencia)

- Simular OpenAI 429/timeout → retries → fallback

---

## 10) Entregables (archivos en tu repo)

- `prompts/entelequia_intent_system_prompt_v1.txt`
- `schemas/entelequia_intent_classification.schema.json`
- `src/modules/intent/intent.controller.ts|rb`
- `src/modules/intent/intent.service.ts|rb`
- `src/modules/intent/intent.validator.ts|rb`
- `src/modules/intent/intent.types.ts|rb`
- `tests/intent/*.spec.*`

---

## 11) Resumen de comportamiento (drop-in)

- Input: `text`
- Output: **siempre** `{intent, confidence, entities}`
- Igual que n8n:
  - 2 mensajes (system + user)
  - json schema output
  - retry on fail
  - simplify output (solo payload)
  - always output data (fallback 200)

---
