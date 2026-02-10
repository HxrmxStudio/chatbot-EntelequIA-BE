# Chatbot Integration Guide - Entelequia Backend

**Version:** 1.0  
**Date:** January 2026  
**Approach:** Plug-and-play using existing Entelequia API endpoints. **Zero Laravel code changes required.**

---

## Table of Contents

1. [Overview](#overview)
2. [Entelequia API Endpoints Reference](#entelequia-api-endpoints-reference)
3. [Authentication Strategy](#authentication-strategy)
4. [N8N Workflow Configuration](#n8n-workflow-configuration)
5. [Frontend Chat Widget Setup](#frontend-chat-widget-setup)
6. [WhatsApp Integration](#whatsapp-integration)
7. [Testing & Validation](#testing--validation)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This guide enables you to integrate a chatbot (N8N + OpenAI) with the existing Entelequia Laravel backend **without modifying any Laravel code**. The chatbot will:

- Answer product questions using existing product endpoints
- Check order status using existing customer endpoints
- Provide recommendations and search results
- Handle FAQs and general inquiries

**Architecture:**

```
[Web Chat Widget] ──┐
                    ├──> [N8N Webhook] ──> [Entelequia API] ──> [OpenAI] ──> [Response]
[WhatsApp] ─────────┘
```

**Key Principle:** N8N orchestrates multiple API calls to Entelequia and aggregates the data before sending to OpenAI.

---

## Entelequia API Endpoints Reference

**Base URL:** `https://entelequia.com.ar/api/v1` (production)  
**API Version:** v1  
**Content-Type:** `application/json`

### Public Endpoints (No Authentication Required)

These endpoints work immediately without any setup.

#### 1. Product Search

**Endpoint:** `GET /api/v1/products-list/{categorySlug?}`

**Query Parameters:**

- `q` (optional): Search query string
- `idioma` (optional): Language filter
- `formato` (optional): Format filter
- `editorial` (optional): Publisher filter
- `autor` (optional): Author filter
- `precioMin` (optional): Minimum price
- `precioMax` (optional): Maximum price
- `ofertas` (optional): Filter offers (true/false)
- `orderBy` (optional): Sort order (default: 'recent')

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/products-list?q=manga&orderBy=recent
```

**Example Response:**

```json
{
  "products": {
    "data": [
      {
        "id": 12345,
        "slug": "one-piece-vol-100",
        "title": "One Piece Vol. 100",
        "images": [
          {
            "id": 1,
            "url": "https://entelequia.com.ar/storage/products/one-piece-100.jpg"
          }
        ],
        "stock": 15,
        "price": {
          "amount": 2500.0,
          "currency": "ARS"
        },
        "discount_percent": null,
        "priceWithDiscount": null,
        "categories": [
          {
            "id": 5,
            "slug": "manga",
            "name": "Manga"
          }
        ]
      }
    ],
    "current_page": 1,
    "total": 25
  },
  "offers": null
}
```

**Chatbot Use Cases:**

- "Show me manga books" → `GET /api/v1/products-list/manga`
- "Search for One Piece" → `GET /api/v1/products-list?q=one+piece`
- "What's on sale?" → `GET /api/v1/products-list?ofertas=true`

---

#### 2. Single Product Details

**Endpoint:** `GET /api/v1/product/{id}`

Accepts product ID (integer) or slug (string).

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/product/12345
# or
GET https://entelequia.com.ar/api/v1/product/one-piece-vol-100
```

**Example Response:**

```json
{
  "product": {
    "id": 12345,
    "slug": "one-piece-vol-100",
    "title": "One Piece Vol. 100",
    "description": "Luffy and his crew continue their adventure...",
    "isbn": "978-4-08-883123-4",
    "images": [...],
    "stock": 15,
    "price": {
      "amount": 2500.00,
      "currency": "ARS"
    },
    "discount_percent": 10.0,
    "priceWithDiscount": {
      "amount": 2250.00,
      "currency": "ARS"
    },
    "categories": [...],
    "authors": [...],
    "brand": {...},
    "dimensions": {...}
  }
}
```

**Chatbot Use Cases:**

- "Tell me about product 12345"
- "What's the price of One Piece Vol. 100?"

---

#### 3. Latest Products

**Endpoint:** `GET /api/v1/products/latest`

Returns newest products (paginated, 20 per page).

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/products/latest
```

**Example Response:**

```json
{
  "data": [
    {
      "id": 12345,
      "title": "New Product",
      "price": {...},
      ...
    }
  ],
  "current_page": 1,
  "total": 100
}
```

**Chatbot Use Cases:**

- "What's new?"
- "Show me latest arrivals"

---

#### 4. Recommended Products

**Endpoint:** `GET /api/v1/products/recommended`

Returns recommended products (paginated).

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/products/recommended
```

**Chatbot Use Cases:**

- "What do you recommend?"
- "Show me recommendations"

---

#### 5. Product Suggestions (Autocomplete)

**Endpoint:** `GET /api/v1/products/suggestions`

**Query Parameters:**

- `search` (required): Search query

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/products/suggestions?search=one+piece
```

**Example Response:**

```json
[
  {
    "id": 12345,
    "slug": "one-piece-vol-100",
    "title": "One Piece Vol. 100",
    "price": {...}
  },
  {
    "id": 12346,
    "slug": "one-piece-vol-101",
    "title": "One Piece Vol. 101",
    "price": {...}
  }
]
```

**Chatbot Use Cases:**

- Intent detection: "User typed 'one piece' → check suggestions"
- Autocomplete functionality

---

#### 6. Categories Tree

**Endpoint:** `GET /api/v1/categories/tree`

Returns all categories in hierarchical structure.

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/categories/tree
```

**Example Response:**

```json
[
  {
    "id": 1,
    "name": "Comics",
    "slug": "comics",
    "children": [
      {
        "id": 5,
        "name": "Manga",
        "slug": "manga",
        "children": []
      }
    ]
  }
]
```

**Chatbot Use Cases:**

- "What categories do you have?"
- Category navigation

---

#### 7. Payment Information

**Endpoint:** `GET /api/v1/cart/payment-info`

Returns available payment methods and information.

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/cart/payment-info
```

**Chatbot Use Cases:**

- "How can I pay?"
- "What payment methods do you accept?"

---

### Customer Endpoints (Authentication Required)

These endpoints require a Passport Bearer token obtained via login.

#### 8. Customer Login

**Endpoint:** `POST /api/v1/login`

**Request Body:**

```json
{
  "email": "customer@example.com",
  "password": "user_password"
}
```

**Example Request:**

```bash
POST https://entelequia.com.ar/api/v1/login
Content-Type: application/json

{
  "email": "customer@example.com",
  "password": "password123"
}
```

**Example Response:**

```json
{
  "user": {
    "id": 1,
    "name": "Juan",
    "email": "customer@example.com"
  },
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Important:** Save the `access_token` for subsequent authenticated requests.

---

#### 9. Customer Orders List

**Endpoint:** `GET /api/v1/account/orders`

**Headers:**

```
Authorization: Bearer {access_token}
```

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/account/orders
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Example Response:**

```json
{
  "data": [
    {
      "id": 50110,
      "created_at": "2026-01-15T10:30:00.000000Z",
      "state": "processing",
      "total": {
        "amount": 5000.0,
        "currency": "ARS"
      },
      "orderItems": [
        {
          "product_id": 12345,
          "quantity": 2,
          "price": 2500.0
        }
      ],
      "shipTrackingCode": "ABC123456",
      "shipMethod": "correo_argentino"
    }
  ]
}
```

**Chatbot Use Cases:**

- "Show my orders"
- "What orders do I have?"

---

#### 10. Single Order Details

**Endpoint:** `GET /api/v1/account/orders/{id}`

**Headers:**

```
Authorization: Bearer {access_token}
```

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/account/orders/50110
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Example Response:**

```json
{
  "order": {
    "id": 50110,
    "state": "processing",
    "created_at": "2026-01-15T10:30:00.000000Z",
    "orderBillAddress": {...},
    "orderShipAddress": {...},
    "orderItems": [...],
    "payment": {
      "payment_method": "mercadopago",
      "status": "approved"
    },
    "shipMethod": "correo_argentino",
    "shipTrackingCode": "ABC123456",
    "total": {
      "amount": 5000.00,
      "currency": "ARS"
    }
  }
}
```

**Chatbot Use Cases:**

- "Where is order #50110?"
- "What's the status of my order?"
- "Give me tracking for order 50110"

---

#### 11. Customer Profile

**Endpoint:** `GET /api/v1/account/profile`

**Headers:**

```
Authorization: Bearer {access_token}
```

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/account/profile
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Example Response:**

```json
{
  "profile": {
    "id": 1,
    "name": "Juan",
    "surname": "Pérez",
    "email": "customer@example.com",
    "phone": "+5491123456789",
    "promotion_points": 150,
    "billAddress": {...},
    "shipAddress": {...}
  }
}
```

**Chatbot Use Cases:**

- Personalization: "Based on your profile..."
- Order history context

---

#### 12. Customer Favorites

**Endpoint:** `GET /api/v1/account/favorites`

**Headers:**

```
Authorization: Bearer {access_token}
```

**Example Request:**

```bash
GET https://entelequia.com.ar/api/v1/account/favorites
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Chatbot Use Cases:**

- "Show my favorites"
- "What's in my wishlist?"

---

## Authentication Strategy

### Option 1: Public Queries (No Auth)

For product searches, categories, and general information, **no authentication is needed**. N8N can call these endpoints directly.

**N8N Configuration:**

```
HTTP Request Node:
- Method: GET
- URL: https://entelequia.com.ar/api/v1/products-list?q={{ $json.searchQuery }}
- No Authorization header needed
```

---

### Option 2: Customer Order Lookups

For order status and profile queries, you have two approaches:

#### Approach A: User Provides Email (Recommended)

1. User sends message: "Where is my order?"
2. Chatbot asks: "What's your email?"
3. N8N calls Entelequia login endpoint with email/password (if user provides password)
4. N8N uses returned `access_token` to call order endpoints

**Limitation:** Requires user to provide password, which may not be ideal for chat.

#### Approach B: Pre-authenticated Sessions (Better UX)

1. User authenticates via Entelequia web app (normal login flow)
2. Frontend chat widget stores `access_token` in localStorage
3. Chat widget sends `access_token` in webhook payload to N8N
4. N8N uses token for authenticated requests

**N8N Webhook Payload:**

```json
{
  "source": "web",
  "userId": "user@example.com",
  "conversationId": "conv-123",
  "text": "Where is my order?",
  "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGc..." // From frontend
}
```

**N8N HTTP Request Node:**

```
Method: GET
URL: https://entelequia.com.ar/api/v1/account/orders
Headers:
  Authorization: Bearer {{ $json.accessToken }}
```

#### Approach C: Service Account (For Admin Lookups)

If you need to look up orders by order ID without user authentication:

1. Create a service account user in Entelequia
2. Generate a Passport token for this user (via `php artisan passport:client --personal`)
3. Store token securely in N8N credentials
4. Use this token for order lookups by ID

**Note:** This requires admin-level access and should be used carefully.

---

## N8N Workflow Configuration

### Workflow 1: Main Chatbot Webhook (WF1)

This workflow receives messages from web chat or WhatsApp and orchestrates responses.

#### Node 1: Webhook Trigger

**Configuration:**

- **HTTP Method:** POST
- **Path:** `/chatbot/webhook`
- **Authentication:** None (we'll validate via signature)

**Expected Payload:**

```json
{
  "source": "web", // or "whatsapp"
  "userId": "user@example.com", // email for web, phone for WhatsApp
  "conversationId": "conv-123",
  "text": "¿Qué productos tienen en stock?",
  "accessToken": "optional-bearer-token-if-authenticated"
}
```

---

#### Node 2: Intent Detection (Code Node)

Detect what the user is asking for:

```javascript
const text = $json.text.toLowerCase();
const source = $json.source;

let intent = 'general';
let entities = {};

// Product search intent
if (
  text.match(/producto|libro|manga|comic|buscar|tienen|stock|precio|costo/i)
) {
  intent = 'product_search';

  // Extract search query
  const searchMatch = text.match(
    /(?:buscar|tienen|precio|costo de|cuánto cuesta)\s+(.+)/i
  );
  if (searchMatch) {
    entities.searchQuery = searchMatch[1].trim();
  }
}

// Order status intent
if (text.match(/orden|pedido|envío|tracking|dónde está|estado/i)) {
  intent = 'order_status';

  // Extract order ID
  const orderMatch = text.match(/(?:orden|pedido)\s*#?(\d+)/i);
  if (orderMatch) {
    entities.orderId = orderMatch[1];
  }
}

// Category intent
if (text.match(/categoría|categorias|qué tienen|tipos/i)) {
  intent = 'categories';
}

// Recommendations intent
if (text.match(/recomend|suger|nuevo|último/i)) {
  intent = 'recommendations';
}

return {
  intent: intent,
  entities: entities,
  originalText: $json.text,
  userId: $json.userId,
  conversationId: $json.conversationId,
  source: $json.source,
  accessToken: $json.accessToken || null,
};
```

---

#### Node 3: Switch Node (Route by Intent)

Route to different flows based on intent:

- `product_search` → Product Search Flow
- `order_status` → Order Status Flow
- `categories` → Categories Flow
- `recommendations` → Recommendations Flow
- `general` → FAQ/OpenAI Flow

---

#### Node 4a: Product Search Flow

**HTTP Request Node:**

```
Method: GET
URL: https://entelequia.com.ar/api/v1/products-list?q={{ $json.entities.searchQuery }}
```

**Code Node (Format for OpenAI):**

```javascript
const products = $inputData[0].products.data || [];
const productList = products
  .slice(0, 5)
  .map((p) => `- ${p.title}: $${p.price.amount} (Stock: ${p.stock})`)
  .join('\n');

return {
  context: `Productos disponibles:\n${productList}`,
  productCount: products.length,
  intent: 'product_search',
};
```

---

#### Node 4b: Order Status Flow

**HTTP Request Node (Check if token exists):**

```
Method: GET
URL: https://entelequia.com.ar/api/v1/account/orders
Headers:
  Authorization: Bearer {{ $json.accessToken }}
```

**If no token, return:**

```json
{
  "requiresAuth": true,
  "message": "Para consultar tus órdenes, necesitas iniciar sesión. Por favor, visita entelequia.com.ar y luego vuelve al chat."
}
```

**If token exists, format order data:**

```javascript
const orders = $inputData[0].data || [];
const orderId = $json.entities.orderId;

let orderData = null;
if (orderId) {
  orderData = orders.find((o) => o.id == orderId);
} else {
  orderData = orders[0]; // Most recent
}

if (!orderData) {
  return {
    context: 'No se encontró la orden solicitada.',
    intent: 'order_status',
  };
}

return {
  context: `Orden #${orderData.id}:\nEstado: ${orderData.state}\nTotal: $${
    orderData.total.amount
  }\nTracking: ${orderData.shipTrackingCode || 'No disponible'}`,
  orderId: orderData.id,
  intent: 'order_status',
};
```

---

#### Node 5: OpenAI Integration

**OpenAI ChatGPT Node:**

```
Model: gpt-3.5-turbo
System Message: Eres un asistente de Entelequia, una tienda de libros, comics y mangas. Responde siempre en español de manera amigable y profesional. Mantén respuestas breves (máximo 200 caracteres).

Información disponible:
{{ $json.context }}

IMPORTANTE:
- Si el usuario pregunta por productos, menciona los productos disponibles de la lista.
- Si pregunta por una orden, proporciona el estado y tracking si está disponible.
- Si no tienes información suficiente, sé honesto y ofrece ayuda.
```

**User Message:** `{{ $json.originalText }}`

---

#### Node 6: Save Conversation (PostgreSQL)

Save message and response to database for context in future conversations.

---

#### Node 7: Return Response

**HTTP Respond to Webhook Node:**

```json
{
  "ok": true,
  "message": "{{ $json.message }}",
  "conversationId": "{{ $json.conversationId }}",
  "intent": "{{ $json.intent }}"
}
```

---

### Workflow 2: WhatsApp Formatter (WF2)

Optional workflow to format responses for WhatsApp (truncate long messages, add formatting).

**Trigger:** Called from WF1 when `source === 'whatsapp'`

**Nodes:**

1. Code Node: Truncate message if > 1600 chars
2. Format with WhatsApp-friendly structure
3. Send to WhatsApp API (Meta Cloud API)
4. Update outbox status

---

### Workflow 3: Outbox Retry Worker (WF3)

**Trigger:** Cron (every 30 seconds)

**Purpose:** Retry failed WhatsApp sends with exponential backoff.

---

## Frontend Chat Widget Setup

The chat widget (React component) needs minimal configuration to connect to N8N.

### Environment Variables

Create `.env` file in your frontend project:

```bash
# N8N Webhook URL (where your N8N is hosted)
# For N8N Cloud: use /webhook-test/{webhook-id} path
# For self-hosted (recommended): /webhook/chatbot/webhook
VITE_N8N_WEBHOOK_URL=https://your-instance.app.n8n.cloud/webhook-test/YOUR-WEBHOOK-ID
# OR for self-hosted:
# VITE_N8N_WEBHOOK_URL=http://localhost:5678/webhook/chatbot/webhook

# Entelequia API Base URL (for direct product links)
VITE_ENTELEQUIA_API_URL=https://entelequia.com.ar/api/v1
VITE_ENTELEQUIA_WEB_URL=https://entelequia.com.ar
```

**Note:** If you add `VITE_WEBHOOK_SECRET`, remember that any `VITE_*` value is public in the browser. Use it only as a weak signal. Real security should be enforced at Nginx/N8N (rate limiting, HMAC for server-to-server channels).

### Widget Configuration

**In your React chat widget component:**

```typescript
// src/services/chat.ts
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

export async function sendMessage(
  text: string,
  userId: string,
  conversationId: string,
  accessToken?: string
): Promise<BotResponse> {
  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': import.meta.env.VITE_WEBHOOK_SECRET || '', // Optional (not a real secret in frontend)
    },
    body: JSON.stringify({
      source: 'web',
      userId: userId, // User's email if logged in, or generated UUID
      conversationId: conversationId,
      text: text,
      accessToken: accessToken || null, // Pass token if user is authenticated
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  return response.json();
}
```

### Getting Access Token from Entelequia

If user is logged into Entelequia web app, extract token from their session:

```typescript
// After user logs in via Entelequia
const loginResponse = await fetch('https://entelequia.com.ar/api/v1/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const { access_token } = await loginResponse.json();

// Store in localStorage or state
localStorage.setItem('entelequia_token', access_token);

// Use in chat widget
sendMessage(text, userId, conversationId, access_token);
```

---

## WhatsApp Integration

### Step 1: Meta WhatsApp Business Setup

1. Go to [Facebook Developers](https://developers.facebook.com)
2. Create a Business App
3. Add WhatsApp product
4. Get your:
   - **WhatsApp Phone Number ID**
   - **WhatsApp Access Token**
   - **Webhook Verify Token** (create a random string)

### Step 2: Configure N8N Webhook for WhatsApp

**In N8N:**

1. Create a new webhook workflow
2. Set webhook path: `/webhook/whatsapp`
3. Method: POST
4. Add signature validation node (see security section)

**Webhook URL to configure in Meta:**

```
https://your-n8n-domain.com/webhook/whatsapp
```

### Step 3: Meta Webhook Configuration

In Meta App Dashboard → WhatsApp → Configuration:

- **Webhook URL:** `https://your-n8n-domain.com/webhook/whatsapp`
- **Verify Token:** Your random string (e.g., `abc123secure`)
- **Webhook Fields:** Subscribe to `messages`

### Step 4: N8N WhatsApp Message Handler

**Node 1: Webhook Trigger**

Receives Meta webhook payload:

```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "5491123456789",
                "text": {
                  "body": "¿Qué productos tienen?"
                },
                "timestamp": "1234567890"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Node 2: Extract Message Data (Code)**

```javascript
const entry = $json.entry[0];
const change = entry.changes[0];
const message = change.value.messages[0];

return {
  source: 'whatsapp',
  userId: message.from, // Phone number
  conversationId: `whatsapp_${message.from}`,
  text: message.text.body,
  timestamp: message.timestamp,
  messageId: message.id,
};
```

**Node 3: Call Main Chatbot Workflow**

Use N8N's "Execute Workflow" node to call WF1 (Main Chatbot), or duplicate the logic.

**Node 4: Format Response for WhatsApp**

```javascript
const botResponse = $inputData[0].message;

// Truncate if too long (WhatsApp limit ~1600 chars)
const maxLength = 1600;
const formatted =
  botResponse.length > maxLength
    ? botResponse.substring(0, maxLength - 3) + '...'
    : botResponse;

return {
  to: $json.userId, // Phone number
  message: formatted,
};
```

**Node 5: Send to WhatsApp API**

**HTTP Request Node:**

```
Method: POST
URL: https://graph.facebook.com/v18.0/{{ WHATSAPP_PHONE_ID }}/messages
Headers:
  Authorization: Bearer {{ WHATSAPP_ACCESS_TOKEN }}
  Content-Type: application/json

Body:
{
  "messaging_product": "whatsapp",
  "to": "{{ $json.to }}",
  "type": "text",
  "text": {
    "body": "{{ $json.message }}"
  }
}
```

---

## Testing & Validation

### Test 1: Product Search

**Web Chat:**

```bash
curl -X POST https://your-n8n-domain.com/webhook/chatbot/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "web",
    "userId": "test@example.com",
    "conversationId": "test-123",
    "text": "¿Qué productos de manga tienen?"
  }'
```

**Expected:** Bot responds with manga products from Entelequia API.

---

### Test 2: Order Status (With Auth)

**Web Chat:**

```bash
curl -X POST https://your-n8n-domain.com/webhook/chatbot/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "source": "web",
    "userId": "customer@example.com",
    "conversationId": "test-456",
    "text": "¿Dónde está mi orden #50110?",
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  }'
```

**Expected:** Bot responds with order status and tracking.

---

### Test 3: WhatsApp Message

Send WhatsApp message to your Meta WhatsApp number:

```
"¿Qué productos tienen en stock?"
```

**Expected:** Bot responds via WhatsApp with product information.

---

### Test 4: Error Handling

**Test with invalid token:**

```bash
curl -X POST ... \
  -d '{
    "text": "Show my orders",
    "accessToken": "invalid-token"
  }'
```

**Expected:** Bot responds: "Necesitas iniciar sesión para ver tus órdenes..."

---

## Troubleshooting

### Issue: "401 Unauthorized" on Order Endpoints

**Cause:** Missing or invalid `access_token`.

**Solution:**

1. Verify user logged in via Entelequia
2. Check token is passed in webhook payload
3. Token may have expired (Passport tokens can expire)

**Workaround:** Prompt user to log in via web app first.

---

### Issue: Product Search Returns Empty

**Cause:** Search query doesn't match product titles.

**Solution:**

1. Try broader search terms
2. Use `/api/v1/products/suggestions` for autocomplete
3. Check Entelequia API directly: `curl https://entelequia.com.ar/api/v1/products-list?q=test`

---

### Issue: WhatsApp Messages Not Received

**Checklist:**

1. ✅ Meta webhook URL is correct
2. ✅ Webhook is verified in Meta dashboard
3. ✅ N8N webhook is active and listening
4. ✅ Check N8N execution logs for errors
5. ✅ Verify WhatsApp Access Token is valid

---

### Issue: N8N Can't Reach Entelequia API

**Possible Causes:**

- CORS issues (if N8N is browser-based)
- Network/firewall blocking
- Entelequia API is down

**Solution:**

- N8N runs server-side, so CORS shouldn't be an issue
- Test API directly: `curl https://entelequia.com.ar/api/v1/products/latest`
- Check N8N server can reach internet

---

### Issue: OpenAI Responses Too Generic

**Solution:**

1. Improve system prompt with more Entelequia-specific context
2. Include more product data in context
3. Use GPT-4 instead of GPT-3.5 for better responses
4. Add few-shot examples in system prompt

---

## CORS Configuration

**IMPORTANT:** N8N webhooks require CORS configuration to allow requests from your frontend domain.

### For N8N Cloud (entelequia.app.n8n.cloud)

N8N Cloud webhooks have CORS enabled by default, but you may need to verify:

1. Go to your N8N Cloud dashboard
2. Navigate to Settings → Webhooks
3. Ensure "Allow CORS" is enabled
4. Add your frontend origin to allowed origins:
   - Development: `http://localhost:5173` (or your Vite dev port)
   - Production: `https://entelequia.com.ar`

### For Self-Hosted N8N

If self-hosting N8N, configure CORS in your N8N environment variables:

```bash
# In your N8N .env file
N8N_CORS_ORIGIN=http://localhost:5173,https://entelequia.com.ar
```

Or configure via nginx reverse proxy:

```nginx
location /webhook/ {
    # CORS headers
    add_header 'Access-Control-Allow-Origin' '$http_origin' always;
    add_header 'Access-Control-Allow-Methods' 'POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, x-webhook-secret' always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;

    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        return 204;
    }

    proxy_pass http://localhost:5678;
}
```

### Troubleshooting CORS Errors

If you see "CORS Error" in the browser console:

1. **Check N8N webhook URL**: Verify `VITE_N8N_WEBHOOK_URL` matches your N8N instance
2. **Verify CORS is enabled**: Check N8N settings or environment variables
3. **Check allowed origins**: Ensure your frontend domain is in the allowed list
4. **Test with curl**: Verify webhook works without CORS:
   ```bash
   curl -X POST https://entelequia.app.n8n.cloud/webhook-test/... \
     -H "Content-Type: application/json" \
     -d '{"source":"web","userId":"test","conversationId":"test","text":"test"}'
   ```

---

## Security Considerations

### 1. Webhook Signature Validation

Add HMAC validation to N8N webhook (see `docs/N8N/wf1_main_webhook.md` for implementation).

### 2. Rate Limiting

Configure rate limiting in N8N or use nginx reverse proxy:

- 10 requests/second per IP
- 30 requests/second for chat endpoints

### 3. Token Storage

- Never log `access_token` values
- Store tokens encrypted in N8N credentials
- Rotate tokens periodically

### 4. Input Validation

- Validate `userId` format (email or phone)
- Sanitize `text` input (remove HTML, limit length)
- Validate `conversationId` format

---

## Next Steps

1. **Set up N8N instance** (self-hosted or cloud)
2. **Configure webhook workflows** following this guide
3. **Test with Entelequia API** using curl or Postman
4. **Deploy chat widget** to Entelequia frontend
5. **Configure WhatsApp** webhook in Meta dashboard
6. **Monitor and iterate** based on user interactions

---

## Reference: Complete Endpoint List

| Endpoint                            | Method | Auth | Purpose         |
| ----------------------------------- | ------ | ---- | --------------- |
| `/api/v1/product/{id}`              | GET    | No   | Product details |
| `/api/v1/products-list/{category?}` | GET    | No   | Search products |
| `/api/v1/products/latest`           | GET    | No   | New arrivals    |
| `/api/v1/products/recommended`      | GET    | No   | Recommendations |
| `/api/v1/products/suggestions`      | GET    | No   | Autocomplete    |
| `/api/v1/categories/tree`           | GET    | No   | Category list   |
| `/api/v1/cart/payment-info`         | GET    | No   | Payment methods |
| `/api/v1/login`                     | POST   | No   | Get auth token  |
| `/api/v1/account/orders`            | GET    | Yes  | Order list      |
| `/api/v1/account/orders/{id}`       | GET    | Yes  | Order details   |
| `/api/v1/account/profile`           | GET    | Yes  | User profile    |
| `/api/v1/account/favorites`         | GET    | Yes  | Wishlist        |

---

## Support & Documentation

- **Entelequia API Base:** `https://entelequia.com.ar/api/v1`
- **N8N Documentation:** https://docs.n8n.io
- **Meta WhatsApp API:** https://developers.facebook.com/docs/whatsapp
- **OpenAI API:** https://platform.openai.com/docs

---

**Status:** ✅ Ready for implementation  
**Last Updated:** January 2026  
**Zero Laravel Changes Required**
