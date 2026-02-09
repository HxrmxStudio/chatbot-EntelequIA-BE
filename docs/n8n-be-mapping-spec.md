# N8N <-> Backend Mapping Spec (Widget Embebido)

Fecha: 2026-02-09  
Workspace frontend: `/Users/user/Workspace/entelequia_tienda`  
Workspace widget/docs N8N: `/Users/user/Workspace/chatbot-EntelequIA/chatbot-widget`  
Workspace backend (Laravel): `/Users/user/Workspace/p-entelequia24`

## 1. Objetivo

Definir el mapeo tecnico final entre:

1. Widget embebido en frontend web.
2. Workflow N8N (WF1/WF2/WF3).
3. Backend Laravel de Entelequia.

Este documento fija:

1. Contratos de entrada y salida.
2. Endpoints reales a usar (productos, ordenes, pagos).
3. Reglas de auth para guest/logged.
4. Manejo de errores de negocio y red.
5. Checklist implementable en N8N.

## 2. Fuentes de verdad

1. N8N AS-IS (modular):  
   `/Users/user/Workspace/chatbot-EntelequIA/chatbot-widget/src/docs/N8N/architecture_summary.md`
2. WF1 AS-IS:  
   `/Users/user/Workspace/chatbot-EntelequIA/chatbot-widget/src/docs/N8N/wf1_main_webhook.md`
3. Rutas backend reales:  
   `/Users/user/Workspace/p-entelequia24/routes/api.php`
4. Controladores/recursos backend reales:
   - `/Users/user/Workspace/p-entelequia24/app/Http/Controllers/Front/ProductController.php`
   - `/Users/user/Workspace/p-entelequia24/app/Http/Controllers/Customer/OrderController.php`
   - `/Users/user/Workspace/p-entelequia24/app/Http/Controllers/PaymentInfoController.php`
   - `/Users/user/Workspace/p-entelequia24/app/Resources/ProductCollection.php`
   - `/Users/user/Workspace/p-entelequia24/app/Resources/OrderCollection.php`

## 3. Decisiones cerradas

## 3.1 Arquitectura de integracion

Se adopta flujo modular AS-IS:

1. WF1 resuelve intent.
2. WF1 llama endpoints de backend segun intent.
3. WF1 arma contexto para LLM.
4. WF1 responde web y encola WhatsApp si corresponde.

No se usa por ahora `POST /chatbot/context` porque no existe en backend actual.

### 3.2 Endpoints no validos en produccion actual

No usar:

1. `GET /api/v1/products` (no existe endpoint publico).
2. `POST /chatbot/context` (no existe ruta en Laravel actual).

## 4. Contrato Frontend -> WF1 (web chat)

## 4.1 Request (webhook body)

```json
{
  "source": "web",
  "userId": "string",
  "conversationId": "string",
  "text": "string",
  "accessToken": "string optional",
  "currency": "ARS optional",
  "locale": "es-AR optional"
}
```

Reglas:

1. `source` obligatorio: `web` o `whatsapp`.
2. `userId` obligatorio (guest ID o user ID real).
3. `conversationId` obligatorio y estable por conversacion.
4. `text` obligatorio, 1..4096 chars despues de sanitize.
5. `accessToken` solo cuando usuario logueado.

### 4.2 Response (union)

Exito:

```json
{
  "ok": true,
  "message": "string",
  "conversationId": "string",
  "intent": "string optional"
}
```

Auth requerida:

```json
{
  "ok": false,
  "requiresAuth": true,
  "message": "Para consultar tus ordenes, inicia sesion."
}
```

Error generico:

```json
{
  "ok": false,
  "message": "No pudimos procesar tu mensaje."
}
```

## 5. Contrato Host Frontend -> Widget embebido

El widget debe consumir contexto del host, no leer localStorage propio hardcodeado.

```ts
type ChatAuthMode = 'guest' | 'authenticated';

interface HostUserContext {
  userId: string;
  authMode: ChatAuthMode;
  accessToken?: string;
  currency?: 'ARS' | 'USD';
  locale?: string;
}
```

Fuente host actual:

1. Token: `entelequia-access-token-v2`.
2. User id: `entelequia-user-id` si existe.
3. Currency: `entelequia-currency` (ARS/USD).

## 6. WF1 Node-by-Node Mapping

## 6.1 Nodo 1 - Webhook

1. Method: `POST`
2. Path: `/chatbot/webhook` (o el path definido en N8N cloud/self-hosted).
3. Entrada: payload de seccion 4.

### 6.2 Nodo 2 - Signature Validation

Para web:

1. Validar `x-webhook-secret` (si se usa).
2. Si no coincide: rechazar 401.

Nota: en browser este header no es secreto real. Si se requiere seguridad fuerte, mover firma al backend proxy.

### 6.3 Nodo 3 - Input Validation

Validar:

1. `source` in `web|whatsapp`.
2. `userId` 1..255.
3. `conversationId` 1..255.
4. `text` 1..4096.
5. Sanitizacion HTML/basic injection.

### 6.4 Nodo 4 - Check Idempotency

Persistir/consultar `external_events` usando clave unica por evento.

### 6.5 Nodo 5 - User Context + History (Postgres)

1. Obtener datos de conversacion previa.
2. Cargar ultimos N mensajes para contexto LLM.

### 6.6 Nodo 6 - Extract Intent

Salida minima:

```json
{
  "intent": "product_search|order_status|payment_info|recommendations|store_info|general",
  "entities": {
    "query": "optional",
    "orderId": "optional"
  }
}
```

### 6.7 Nodo 7 - Switch por intent

Ramas definidas en seccion 7.

### 6.8 Nodo 8 - Merge Context Blocks

Unir bloques normalizados en `aiContextBlocks[]`.

### 6.9 Nodo 9 - OpenAI Chat

Prompt incluye:

1. Mensaje usuario.
2. Historial resumido.
3. `aiContextBlocks`.
4. Reglas de seguridad/respuesta corta.

### 6.10 Nodo 10 - Save Messages + Audit Log

Guardar:

1. Mensaje user.
2. Mensaje bot.
3. Intent.
4. Metadatos de error/latencia.

### 6.11 Nodo 11 - Router de canal

1. `source=web` -> respuesta HTTP inmediata.
2. `source=whatsapp` -> encolar outbox + responder ack rapido.

## 7. Mapping de intents -> Endpoints backend reales

Base URL:

1. Prod: `https://entelequia.com.ar/api/v1`
2. Local: `http://127.0.0.1:8000/api/v1`

Headers base:

1. `Accept: application/json`
2. `Content-Type: application/json` (si aplica)

## 7.1 Intent: `product_search`

### Endpoint principal

1. Method: `GET`
2. URL: `/products-list/{categorySlug?}`
3. Auth: no requerida

Query recomendada:

1. `q={{entities.query}}`
2. `orderBy=recent`
3. `page=1`
4. `currency={{currency || 'ARS'}}`

Respuesta esperada:

```json
{
  "products": { "data": [], "pagination": {} },
  "offers": null
}
```

### Endpoints auxiliares opcionales

1. `GET /product/{idOrSlug}` para detalle puntual.
2. `GET /products/suggestions?search=...` para autocomplete.
3. `GET /search-suggestions?search=...` solo fallback legacy.

### Formateo para AI

Normalizar top N productos:

```json
{
  "context_type": "products",
  "context_payload": {
    "items": [
      {
        "id": 123,
        "title": "Producto",
        "price": { "currency": "ARS", "amount": 1000 },
        "stock": 5,
        "slug": "producto-slug"
      }
    ]
  }
}
```

## 7.2 Intent: `order_status`

### Gate de autenticacion

Si falta `accessToken`:

1. No llamar backend de ordenes.
2. Responder `ok=false`, `requiresAuth=true`.

### Endpoint lista

1. Method: `GET`
2. URL: `/account/orders`
3. Auth: `Authorization: Bearer {{accessToken}}`
4. Rol requerido backend: `CLIENT`

Respuesta esperada:

```json
{
  "data": [ /* OrderResource */ ],
  "pagination": { /* ... */ }
}
```

### Endpoint detalle (si usuario menciona numero)

1. Method: `GET`
2. URL: `/account/orders/{orderId}`
3. Auth: `Authorization: Bearer {{accessToken}}`

Respuesta esperada:

```json
{
  "order": { /* OrderResource */ }
}
```

### Tratamiento de errores clave

1. 401 -> token invalido/expirado -> `requiresAuth=true`.
2. 403 -> rol no CLIENT -> mensaje de acceso no permitido.
3. 442 -> orden no pertenece al usuario -> mensaje controlado "No encontramos ese pedido en tu cuenta".
4. 404 -> orden inexistente -> mensaje de no encontrado.

## 7.3 Intent: `payment_info` o `shipping_info`

Endpoint:

1. Method: `GET`
2. URL: `/cart/payment-info`
3. Auth: no requerida

Respuesta esperada:

```json
{
  "promotions": [],
  "payment_methods": []
}
```

Uso:

1. Informar medios de pago activos.
2. Promociones vigentes.

## 7.4 Intent: `recommendations`

Endpoint:

1. Method: `GET`
2. URL: `/products/recommended`
3. Auth: no requerida

Query:

1. `page=1`
2. `currency={{currency || 'ARS'}}`

Respuesta:

```json
{
  "data": [ /* ProductResource */ ],
  "pagination": {}
}
```

## 7.5 Intent: `store_info` / `general`

No requiere endpoint de negocio obligatorio.

Opciones:

1. Respuesta estatica curada.
2. Datos publicos precargados.
3. Escalado a ticket/email si aplica.

## 8. Politica de errores (N8N -> Widget)

## 8.1 Matriz

1. BE 400/422 -> responder mensaje de validacion amigable.
2. BE 401 -> `requiresAuth=true`.
3. BE 403 -> mensaje de permisos.
4. BE 404 -> mensaje de no encontrado.
5. BE 442 (orden ajena) -> mensaje controlado de seguridad.
6. BE 5xx/network -> mensaje generico + log interno.
7. Timeout -> mensaje generico + no bloquear UI.

### 8.2 Timeouts/retries sugeridos

1. Timeout HTTP backend: 6-8s.
2. Reintentos:
   - 0 retries para 4xx.
   - 1-2 retries con backoff para 5xx/transient network.

## 9. Seguridad

## 9.1 Reglas

1. Nunca loguear `accessToken` completo.
2. Sanitizar input usuario antes de LLM y antes de persistir.
3. CORS estricto para dominio frontend.
4. Rate limit en webhook.
5. Audit log por request (success/failure).

### 9.2 Recomendacion de hardening

Para no enviar token de usuario directo a N8N desde browser:

1. Frontend -> Backend proxy (`/api/v1/chatbot/message`).
2. Backend valida sesion/token y llama N8N server-to-server.
3. N8N deja de recibir bearer token del cliente.

## 10. Impacto de widget embebido y cambios obligatorios

## 10.1 Cambios obligatorios en widget

1. Dejar de leer key fija `entelequia_access_token`.
2. Recibir `accessToken` y `userId` desde host via callback/config.
3. Mantener `conversationId` persistente por usuario/sesion.

### 10.2 Cambios obligatorios en N8N docs/config

1. Sustituir toda referencia a `GET /api/v1/products` por `/api/v1/products-list`.
2. Mantener rutas de ordenes bajo `/account/orders` con Bearer CLIENT.
3. Unificar docs: elegir enfoque modular AS-IS (actual) como source of truth.

## 11. WF2/WF3 (WhatsApp) - alcance

Widget embebido no altera la logica funcional de:

1. WF2 sender.
2. WF3 retries.

Solo se recomienda mantener:

1. Outbox + retries + audit.
2. Rate limit global y per-message.

## 12. Checklist implementable

1. Corregir endpoint de productos en nodos N8N (`products-list`).
2. Ajustar parser de respuesta a estructura `products.data`.
3. Implementar gate de auth antes de ordenes.
4. Mapear 401/403/442 a respuestas de negocio.
5. Inyectar `currency` en queries de producto/recommendations.
6. Refactor widget para `getUserContext()` del host.
7. Verificar logs sin PII/token.
8. Ejecutar pruebas E2E guest/logged.

## 13. Casos de prueba minimos (E2E)

1. Guest pregunta producto -> respuesta con listado.
2. Guest pregunta orden -> `requiresAuth=true`.
3. Logged pregunta orden -> respuesta con estado real.
4. Logged pide orden ajena -> respuesta segura (caso 442).
5. Error backend 5xx -> fallback generico sin romper chat.

## 14. Criterio de aceptacion final

Integracion aprobada cuando:

1. N8N usa solo endpoints existentes del backend actual.
2. Widget embebido refleja correctamente estado guest/logged.
3. Ordenes solo se consultan con token CLIENT valido.
4. Errores 401/403/442 quedan cubiertos de forma consistente.
5. No hay regresion en frontend (login, cuenta, carrito, checkout).

