# API Endpoints Reference

## Base URLs

- **Development:** `http://localhost:3000`
- **Production:** `https://api.tu-dominio.com`

---

## Chat Service

### POST /api/messages

Send a chat message to the bot.

**Request:**

```json
{
  "text": "string",
  "userId": "string",
  "conversationId": "string",
  "channel": "web|whatsapp|mercadolibre",
  "timestamp": "2026-01-28T10:00:00Z"
}
```

**Response (200):**

```json
{
  "ok": true,
  "message": "string",
  "conversationId": "string",
  "meta": {
    "intent": "faq|order_status|product_search|handoff",
    "confidence": 0.95
  }
}
```

---

### GET /api/conversations/:conversationId

Get conversation history.

**Response (200):**

```json
{
  "id": "string",
  "userId": "string",
  "channel": "web",
  "messages": [
    {
      "id": "string",
      "content": "string",
      "sender": "user|bot|agent",
      "type": "text|error|system",
      "timestamp": "ISO8601"
    }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

### GET /api/users/:userId/context

Get user context for personalization.

**Response (200):**

```json
{
  "userId": "string",
  "email": "string",
  "phone": "string",
  "name": "string",
  "lastOrder": {
    "id": "string",
    "status": "string",
    "total": 1500.0
  },
  "preferences": {},
  "conversationCount": 5
}
```

---

## Products API

### GET /api/products/search?q=keyword

Search products in the catalog.

**Query Parameters:**

- `q` (required): Search query
- `limit` (optional): Max results (default: 10)
- `category` (optional): Filter by category

**Response (200):**

```json
{
  "results": [
    {
      "id": "string",
      "name": "string",
      "price": 1500.0,
      "image": "https://...",
      "url": "https://...",
      "inStock": true
    }
  ],
  "total": 25,
  "page": 1
}
```

---

## Orders API

### GET /api/orders/:orderId

Get order status.

**Response (200):**

```json
{
  "id": "string",
  "externalId": "ORD-12345",
  "status": "pending|processing|shipped|delivered|cancelled",
  "total": 2500.0,
  "tracking": {
    "number": "ABC123456",
    "carrier": "Correo Argentino",
    "url": "https://..."
  },
  "items": [
    {
      "name": "Producto X",
      "quantity": 2,
      "price": 1250.0
    }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

## Support API

### POST /api/tickets

Create a support ticket (human handoff).

**Request:**

```json
{
  "userId": "string",
  "conversationId": "string",
  "subject": "string",
  "priority": "low|medium|high|urgent",
  "context": {
    "lastMessages": []
  }
}
```

**Response (201):**

```json
{
  "ticketId": "SUP-2026-001",
  "status": "open",
  "assignedTo": null,
  "createdAt": "ISO8601"
}
```

---

## Health Check

### GET /health

Service health check.

**Response (200):**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "ISO8601",
  "services": {
    "database": "ok",
    "redis": "ok",
    "openai": "ok"
  }
}
```

---

## WebSocket Events (Socket.io)

### Client → Server

**user_message**

```typescript
socket.emit(
  'user_message',
  {
    text: 'string',
    userId: 'string',
    conversationId: 'string',
    channel: 'web',
    timestamp: 'ISO8601',
  },
  (response) => {
    // Callback with { ok: boolean }
  }
);
```

**typing_start**

```typescript
socket.emit('typing_start', { conversationId: 'string' });
```

**typing_stop**

```typescript
socket.emit('typing_stop', { conversationId: 'string' });
```

### Server → Client

**bot_response**

```typescript
socket.on('bot_response', (data) => {
  // data: { message: string, confidence?: number, intent?: string }
});
```

**bot_typing**

```typescript
socket.on('bot_typing', (data) => {
  // data: { isTyping: boolean }
});
```

**error**

```typescript
socket.on('error', (error) => {
  // error: { message: string, code?: string }
});
```

**agent_joined**

```typescript
socket.on('agent_joined', (data) => {
  // data: { agentName: string, ticketId: string }
});
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "details": {}
}
```

**Status Codes:**

- `200` - Success
- `201` - Created
- `400` - Bad request / Validation error
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `429` - Too many requests (rate limited)
- `500` - Internal server error
- `503` - Service unavailable

---

## Rate Limiting

- **General endpoints:** 10 requests/second per IP
- **Chat/messages:** 30 requests/second per IP
- **Search:** 5 requests/second per IP

Headers returned:

- `X-RateLimit-Limit`: Max requests per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Authentication

Nota (importante): en este repo Laravel (Entelequia) la autenticacion de endpoints privados se hace con **Laravel Passport**:

- Header: `Authorization: Bearer <access_token>`
- Obtencion de token: `POST /api/v1/login`
- Detalle completo: ver `docs/AUTHENTICATION.md`.

Al 2026-02-10 no se encontro implementacion en codigo de un esquema `API_KEY`/HMAC como el que se describe abajo.

For server-to-server communication (webhooks, backend) (documentacion generica):

**Header:**

```
Authorization: Bearer <API_KEY>
```

Or HMAC signature:

```
X-Signature: sha256=<HMAC_SIGNATURE>
X-Timestamp: <UNIX_TIMESTAMP>
```
