Perfecto. Voy a describir **el nodo “Extract Intent” (OpenAI Chat → Message a Model)** tal como está en tu canvas, **con TODO lo que se ve en pantalla**, para que lo puedas replicar 1:1 en tu backend.

---

## 1) Identidad del nodo

- **Nombre del nodo (label en el workflow):** `Extract Intent`
- **Tipo de nodo:** OpenAI (LangChain) / **OpenAI Chat**
- **Operación:** **Message a Model** (en UI: “Generate a model response … using Responses API”)
- **Recurso:** **Text**
- **Versión del nodo:** **OpenAI node version 2.1 (Latest)**

---

## 2) Credenciales / cuenta

- **Credential to connect with:** `OpenAi account`
  - (Esto implica que el nodo usa credenciales guardadas en n8n; en backend sería tu API key/credenciales equivalentes.)

---

## 3) Modelo

- **Model:** `From list`
- **Valor:** `GPT-4O-MINI`

> Ojo: el “From list” es el selector de UI; el valor efectivo es **gpt-4o-mini** (o el id equivalente interno que use n8n).

---

## 4) Estructura de mensajes (prompting)

El nodo envía **2 mensajes** (en orden). Esto es clave para replicación fiel:

### Message #1

- **Type:** Text
- **Role:** `System`
- **Prompt (texto completo):**

Es un system prompt largo en español rioplatense. Contiene:

1. **Rol del modelo:** “Eres un clasificador de intenciones para el chatbot de Entelequia…”

2. **Contexto del negocio:** comiquería + librería en Buenos Aires, +35 años

3. **Taxonomía de intents** (exactamente 7):
   - `products`
   - `orders`
   - `tickets`
   - `store_info`
   - `payment_shipping`
   - `recommendations`
   - `general`

4. Para cada intent, incluye descripciones y ejemplos. En particular:
   - **products:** catálogo, disponibilidad, precios, lanzamientos, editoriales; ejemplos (cómics, manga, libros, figuras, merchandising, juegos, tarot); editoriales (Ivrea, Panini, Ovni Press, Marvel, DC, Norma); series populares (One Piece, Attack on Titan, Death Note, Spider-Man, Batman)
   - **orders:** estado del pedido, tracking, cambios/cancelación, demoras; métodos envío (retiro en tienda: Uruguay 341 o Juramento 2584, envío a domicilio)
   - **tickets:** problemas/devoluciones/quejas/reclamos/soporte; ejemplos: producto dañado, faltante, error factura, producto incorrecto
   - **store_info:** locales, horarios, ubicación, cómo llegar, estacionamiento; locales y horarios:
     - Locales: Uruguay 341 (centro) y Juramento 2584 (Belgrano)
     - Horarios: L a V 10-19hs, Sábados 10-17hs

   - **payment_shipping:** medios de pago, envío, costos, tiempos; medios (tarjeta crédito/débito, Mercado Pago, efectivo en local); envío: retiro sin cargo / envío a domicilio (consultar costo)
   - **recommendations:** pedir recomendaciones o ayuda para elegir productos
   - **general:** saludos, despedidas, agradecimientos, no clasificable

5. **CONTEXTO ARGENTINO** (esto es una regla dura dentro del prompt):
   - lenguaje rioplatense: “vos”, “che”, “boludo amistoso”, etc.
   - festividades locales: Día del Niño, Navidad, Reyes, Hot Sale
   - términos: “historieta”, “tomo”, “preventa”

6. **Ejemplos reales**: varios pares “Usuario:” → “Clasificación:” con JSON (intent/confidence/entities)

7. **REGLAS CRÍTICAS**: heurísticas claras para decidir intent y para el confidence:
   - si es ambiguo → `general` con `confidence < 0.7`
   - extraer entidades (productos/series/tomos/nro pedido/ubicaciones)
   - **Siempre devolver JSON válido** siguiendo el schema exacto

> Importante: ese system prompt está duplicado visualmente en UI (n8n muestra el contenteditable y luego el texto renderizado). El contenido efectivo es el mismo.

---

### Message #2

- **Type:** Text
- **Role:** `User`
- **Prompt:** una expresión que referencia el payload de tu Webhook:

```n8n
{{ $('Webhook').item.json.body.text }}
```

**Qué significa en backend:**

- El mensaje del usuario que se clasifica es **`body.text`** del request que entra por el **Webhook**.
- Si tu BE replica esto, el “user prompt” que pasás al modelo es literalmente el `text` entrante.

---

## 5) Output y contrato (esto es lo más importante)

### 5.1 Output Format

- **Output Format Type:** `JSON Schema (recommended)`
- **Name (del schema/response format):** `entelequia_intent_classification`

### 5.2 Schema (literal)

El schema exige un objeto con:

- `intent`: string enum de 7 valores
- `confidence`: number
- `entities`: array de string
- `required`: intent, confidence, entities
- `additionalProperties`: false

Es decir, **no puede venir ningún campo extra**.

### 5.3 “Strict”

- El checkbox **Strict** aparece **desmarcado**.

Interpretación práctica:

- Aunque esté en JSON Schema, el “strict mode” de n8n **no está activado** (esto puede afectar cuán “hard” es la validación/forced JSON). Igual, el schema existe y es el contrato esperado.

---

## 6) Opciones y toggles del nodo

En la captura se ven estos flags/ajustes:

- ✅ **Simplify Output:** `true` (checked)
  - Esto en n8n normalmente significa que te devuelve un output más directo (menos metadata). En backend: vos probablemente querés que tu endpoint devuelva solo `{intent, confidence, entities}` (o que sea lo que guardás/propagás).

- ✅ **Always Output Data:** `true`
  - Si el nodo “no tendría salida”, igual genera un item vacío.
  - En backend: replicable como “si falla clasificación, devolvé una estructura default” (ej: intent general con confidence baja y entities vacío) o asegurarte de siempre responder con shape fijo.

- ⛔ **Execute Once:** `false` (unchecked)

- ✅ **Retry On Fail:** `true` (checked)
  - Si falla, n8n reintenta. En backend: implementás retry con backoff (aunque n8n tiene “Max. Tries” y “Wait Between Tries” visibles, pero **en tu UI están vacíos**).

- **Max. Tries:** vacío

- **Wait Between Tries (ms):** vacío

- **On Error:** `Stop Workflow`
  - O sea: si no logra, se corta el flujo.

- **Maximum Number of Tokens:** vacío

- **Output Randomness (Temperature):** vacío

- **Verbosity:** `Medium`

- Hay un “Top P” y otros campos en la UI general, pero **no están seteados**.

En backend, esto equivale a:

- no fijar max_tokens
- no fijar temperature/top_p explícitamente (usar defaults)
- mantener verbosity media si tu SDK lo soporta (en Responses API existe concepto de “verbosity” en algunos wrappers; si no, omitís)

---

## 7) Dependencias y datos de entrada (contexto del workflow)

Aunque el nodo sea “solo clasificación”, en la UI se ve:

- “Execute previous nodes to view input data”
- Previews de nodos anteriores (Webhook, Signature Validation, Input Validation, Extract Variables, Check Idempotency, User Context, Conversation History, etc.)

**Pero** este nodo en sí, por cómo está armado el message #2, **solo usa**:

- `$('Webhook').item.json.body.text`

No está consumiendo explícitamente:

- user context
- conversation history
- variables extra

En backend, eso significa que esta etapa de intent classification es **puramente por texto** del usuario (single-turn), aunque el workflow entero tenga contexto.

---

## 8) Resultado esperado (forma exacta)

El output final esperado del modelo (y lo que vos deberías parsear/validar) es:

```json
{
  "intent": "products | orders | tickets | store_info | payment_shipping | recommendations | general",
  "confidence": 0.0,
  "entities": ["..."]
}
```

Reglas implícitas del prompt (importantes para tu BE):

- `confidence` debe ser number (0–1 en ejemplos, aunque schema no limita)
- `entities` siempre array (aunque esté vacío)
- Si es ambiguo: `intent = "general"` y `confidence < 0.7`
- No se permiten campos extra (por schema: `additionalProperties: false`)

---

## 9) Qué replicar “tal cual” en tu backend

Checklist 1:1:

1. **Input**: `text` del request (equivalente a `body.text`)
2. **Request al modelo** con:
   - model: **gpt-4o-mini**
   - messages:
     - system: **el prompt completo** (con categorías, reglas, ejemplos, contexto AR)
     - user: el texto del usuario

3. **Response format**: JSON schema con nombre `entelequia_intent_classification` y el schema exacto
4. **Validación**:
   - debe tener `intent`, `confidence`, `entities`
   - `intent` ∈ enum
   - `entities` array de strings
   - rechazar/limpiar campos extra

5. **Retry**: activado si falla parseo/validación o error transitorio del provider
6. **Always output**: si todo explota, fallback determinístico (recomendado):
   - `{ intent: "general", confidence: 0.55, entities: [] }` (o similar)

---

Si querés, en el próximo mensaje te armo el **spec de implementación backend** (interfaces + validación + retries + fallback + tests) en tu stack (Node/TS o Rails), pero con esto ya tenés la **radiografía completa del nodo** tal como está configurado.
