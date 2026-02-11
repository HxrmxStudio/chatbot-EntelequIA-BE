# Orders API - Interacciones completas (Entelequia)

Version: 1.0
Fecha: 2026-02-04
Fuente de verdad: codigo Laravel (routes/api.php + controllers + repositories + resources)

## Alcance
Este documento describe todos los endpoints de ordenes expuestos por el backend Laravel (api/v1), incluyendo endpoints de cliente y endpoints admin. El objetivo es replicar todas las llamadas posibles desde N8N.

## Base URL
- Produccion: https://entelequia.com.ar/api/v1
- Local: http://127.0.0.1:8000/api/v1 (si corres `php artisan serve`)

## Autenticacion
- Endpoints de cliente: requieren `Authorization: Bearer <access_token>` y rol `CLIENT`.
- Endpoints admin: requieren `Authorization: Bearer <access_token>` y rol permitido (ver cada endpoint).
- Obtencion de token: `POST /api/v1/login` devuelve `access_token` (Laravel Passport).
- Documentacion completa del proceso (API + web + roles + staging + tools internas): ver `docs/AUTHENTICATION.md`.

## SLA, rate limits y disponibilidad
- No hay SLA ni rate limit declarados en el repo.
- No hay middleware de throttle en routes/api.php.
- Recomendacion para N8N: usar timeouts y retry con backoff ante 5xx y 429 si se implementa en infra.

## Convenciones comunes
- Headers recomendados: `Accept: application/json`.
- `Content-Type: application/json` para requests POST/PUT/DELETE.
- Paginacion: `?page=` (Laravel paginator). Tamaño de pagina fijo segun endpoint.
- Moneda: los importes se serializan como `Money` (ver abajo). La moneda depende del pedido (por defecto ARS en checkout). En algunos endpoints se puede enviar `currency` como query para conversion (solo donde se indica).

## Esquemas comunes

### Money

```json
{
  "currency": "ARS",
  "amount": 2500.0
}
```

### OrderItemResource

```json
{
  "id": 999,
  "productId": 12345,
  "productSlug": "one-piece-vol-100",
  "productTitle": "One Piece Vol. 100",
  "quantity": 2,
  "productPrice": { "currency": "ARS", "amount": 2500.0 },
  "totalPrice": { "currency": "ARS", "amount": 5000.0 }
}
```

### OrderResource

```json
{
  "id": 1001,
  "created_at": "2026-02-04T10:00:00Z",
  "state": "Pendiente de pago",
  "orderBillAddress": { /* OrderBillAddress */ },
  "orderShipAddress": { /* OrderShipAddress */ },
  "orderItems": [ /* OrderItemResource */ ],
  "payment": { /* Payment model */ },
  "shipMethod": "Envío - Correo",
  "shipTrackingCode": "ABC123",
  "shipmentAmount": { "currency": "ARS", "amount": 500.0 },
  "isFreeShip": false,
  "discountAmount": { "currency": "ARS", "amount": 200.0 },
  "productsPrice": { "currency": "ARS", "amount": 4800.0 },
  "total": { "currency": "ARS", "amount": 5100.0 },
  "possible_shipping_offices": { /* PossibleShippingOffices */ },
  "coupon_code": "CUPON10"
}
```

### OrderCollection

```json
{
  "data": [ /* OrderResource */ ],
  "pagination": {
    "total": 30,
    "count": 8,
    "per_page": 8,
    "current_page": 1,
    "total_pages": 4
  }
}
```

### Address (OrderBillAddress / OrderShipAddress)
Campos esperados al crear o editar:

```json
{
  "name": "Juan",
  "last_name": "Perez",
  "phone": "+54 11 5555 5555",
  "email": "juan@correo.com",
  "dni": "12345678",
  "street_ln_1": "Calle 123",
  "street_ln_2": "Depto 4B",
  "city": "CABA",
  "province": "Buenos Aires",
  "country": "Argentina",
  "country_code": "AR",
  "zip_code": "1425",
  "street_opt": "",   
  "number_opt": "",
  "floor_opt": "",
  "apartment_opt": ""
}
```
`street_opt`, `number_opt`, `floor_opt`, `apartment_opt` solo aplican a shipping.

### Payment (modelo basico)

```json
{
  "id": 555,
  "payment_method": "Mercado Pago",
  "payment_link": "https://...",
  "amount": 5100.0,
  "created_at": "...",
  "updated_at": "..."
}
```

### Detalles de pago (segun metodo)
- `paymentGetnetDetail`: `payment_intent_id`, `payment_access_token`, `payment_method`, `success_payment_id`, `payment_status`.
- `paymentMODODetail`: `payment_intent_id`, `payment_access_token`, `payment_external_intention_id`, `payment_qr`, `payment_deeplink`, `payment_method`, `payment_status`.
- `paymentOpenpayDetail`: `payment_link`, `payment_uuid`, `payment_access_token`, `payment_method`, `payment_status`.

## Endpoints de ordenes (cliente)

### 1) GET /account/orders
Lista ordenes del cliente autenticado.

Auth: Bearer token + rol CLIENT
Paginacion: si (per_page = 8)

Respuesta:

```json
{ /* OrderCollection */ }
```

### 2) GET /account/orders/{id}
Detalle de una orden del cliente autenticado.

Auth: Bearer token + rol CLIENT

Respuesta:

```json
{ "order": { /* OrderResource */ } }
```

Errores:
- 442: acceso no autorizado (si la orden no pertenece al cliente).
- 404: orden no encontrada.

### 3) POST /account/orders
Crea una orden a partir del carrito actual.

Auth: Bearer token + rol CLIENT

Body (JSON):

```json
{
  "clientAddress": {
    "sameBillingAddress": true,
    "ship_address": { /* Address */ },
    "bill_address": { /* Address */ }
  },
  "shipment": 1,
  "payment": "Mercado Pago",
  "clientNotes": "",
  "selectedOfficeId": null,
  "frontTotal": 5100.0
}
```

Reglas:
- `shipment` usa codigos numericos:
  - `1` = HOME_DELIVERY
  - `2` = WITHDRAW_CENTRO
  - `3` = WITHDRAW_BELGRANO
  - `11` = OFFICE_DELIVERY
- Si `shipment = 11`, `selectedOfficeId` es requerido y debe existir en oficinas posibles.
- `payment` debe ser un metodo activo (segun tabla `payment_methods`). Valores tipicos: `Transferencia`, `Mercado Pago`, `Paypal`, `Getnet`, `MODO`, `Openpay`.
- `frontTotal` es obligatorio (numeric). El backend registra mismatch pero no corta la operacion.
- Puedes enviar `currency` como query o campo (se usa para fijar la moneda del pedido; default ARS).

Respuesta:

```json
{
  "order": { /* OrderResource */ },
  "bankData": { /* solo Transferencia */ },
  "paymentGetnetDetail": { /* solo Getnet */ },
  "paymentMODODetail": { /* solo MODO */ },
  "paymentOpenpayDetail": { /* solo Openpay (ver nota) */ }
}
```

Nota: en el codigo actual hay un `else if` duplicado para MODO, por lo que `paymentOpenpayDetail` podria no devolverse aunque el metodo sea Openpay.

Errores:
- 422: carrito vacio o validacion.
- 422: `NoStockException`, `CouponException`, `ShipmentException`, `PaymentException`.
- 500: error interno.

### 4) POST /account/order/confirm-address
Calcula costo de envio para el carrito actual.

Auth: Bearer token + rol CLIENT

Body (JSON):

```json
{
  "client": {
    "ship_address": {
      "country": "Argentina",
      "country_code": "AR",
      "city": "CABA",
      "zip_code": "1425"
    }
  }
}
```

Query params opcionales:
- `currency`: convierte montos del carrito.
- `with_possible_offices=true`: incluye oficinas posibles.
- `with_recommended=true`: incluye productos recomendados.

Respuesta:

```json
{ /* CartResourceWithOptionalData */ }
```

Errores:
- 422: error de calculo de envio.

### 5) POST /account/order/modo-checkout-intent
Genera intent de pago para MODO.

Auth: Bearer token + rol CLIENT

Body (JSON):

```json
{ "order_id": 1001 }
```

Respuesta:

```json
{ "paymentMODODetail": { /* PaymentMODODetail */ } }
```

Errores:
- 500: error interno.

## Endpoints de ordenes (admin)

### 6) GET /admin/orders
Listado de ordenes online (shop_id null).

Auth: Bearer token + rol ADMIN, SUPERVISOR o SELLER
Paginacion: si (per_page = 25)

Query params:
- `query`: texto (nombre, apellido o id).
- `state`: estado de orden o valores especiales:
  - `Etiqueta impresa` => filtra `is_label_printed = true`
  - `Etiqueta sin imprimir` => filtra `is_label_printed = false`
- `ship`: metodo de envio.
  - Si `ship = "Envío - Correo y Sucursal"` filtra por `Envio - Correo` y `Envío - Sucursal Correo`.
- `page`.

Respuesta:
- Paginador de modelos `Order` con campos extra `client_name`, `client_surname` (join).

### 7) GET /admin/orders/{id}
Detalle de orden online.

Auth: Bearer token + rol ADMIN, SUPERVISOR o SELLER

Respuesta:
- Modelo `Order` con relaciones cargadas (`client`, `orderItems`, `orderBillAddress`, `orderShipAddress`, `orderLogs`, `payment`, `possibleShippingOffices`, `fastmailGuia`).
- Incluye `total_units` calculado.

### 8) GET /admin/orders-export
Exporta listado de ordenes.

Auth: Bearer token + rol ADMIN, SUPERVISOR o SELLER

Respuesta:
- Descarga `pedidos.xlsx`.

### 9) GET /admin/order-state-count
Cuenta ordenes por estado.

Auth: Bearer token + rol ADMIN, SUPERVISOR o SELLER

Respuesta:

```json
[
  { "count": 10, "state": "Pendiente de pago" },
  { "count": 5, "state": "Completado" }
]
```

### 10) POST /admin/order-mass-state
Actualiza estado de multiples ordenes.

Auth: Bearer token + rol ADMIN, SUPERVISOR o SELLER

Body (JSON):

```json
{
  "state": "En preparación",
  "ordersId": "[1001,1002,1003]"
}
```

Respuesta:
- 200 sin body.

### 11) GET /admin/order-stock-log
Log de stock de una orden.

Auth: Bearer token + rol ADMIN, SUPERVISOR

Query params:
- `orderId` (requerido)

Respuesta:
- Lista de `StockLog`.

### 12) PUT /admin/orders/{id}
Edita una orden.

Auth: Bearer token + rol ADMIN, SUPERVISOR

Body (JSON):

```json
{
  "orderState": "En preparación",
  "billAddress": { /* Address */ },
  "shipAddress": { /* Address */ },
  "itemsToAdd": [
    { "product": { "id": 12345 }, "quantity": 1 }
  ],
  "itemsToRemove": [
    { "id": 999 }
  ],
  "trackingCode": "ABC123",
  "clientNotes": "",
  "observations": ""
}
```

Respuesta:
- Modelo `Order` actualizado.

Errores:
- 422: `NoStockException`.
- 500: error interno o envio de mail.

### 13) DELETE /admin/orders/{id}
Elimina una orden.

Auth: Bearer token + rol ADMIN, SUPERVISOR

Respuesta:
- 200 sin body.

### 14) DELETE /admin/orders-destroy-many
Elimina multiples ordenes.

Auth: Bearer token + rol ADMIN, SUPERVISOR

Body (JSON):

```json
{ "ids": "[1001,1002,1003]" }
```

Respuesta:
- 200 sin body.

### 15) GET /admin/orders-label
Genera etiqueta de envio (PDF).

Auth: Bearer token + rol ADMIN, SUPERVISOR

Query params:
- `orderId` (requerido)

Respuesta:
- PDF (binary).

### 16) GET /admin/orders-multiple-labels
Genera multiples etiquetas (PDF).

Auth: Bearer token + rol ADMIN, SUPERVISOR

Query params:
- `ordersId`: string JSON con IDs. Ej: `[1001,1002]`

Respuesta:
- PDF (binary).

### 17) GET /admin/orders-fastmail-label
Genera guia Fastmail.

Auth: Bearer token + rol ADMIN, SUPERVISOR

Query params:
- `orderId` (requerido)

Respuesta:

```json
{ "guia": { /* FastmailGuia */ } }
```

### 18) GET /admin/orders-multiple-fastmail-label
Genera multiples guias Fastmail.

Auth: Bearer token + rol ADMIN, SUPERVISOR

Query params:
- `ordersId`: string JSON con IDs.

Respuesta:
- JSON con guias (success y error).

### 19) POST /admin/orders/{orderId}/refund
Reembolsa orden (solo Getnet).

Auth: Bearer token + rol ADMIN, SUPERVISOR

Respuesta:

```json
{ "message": "Orden reembolsada exitosamente." }
```

Errores:
- 400: orden ya cancelada o metodo no permitido.
- 500: error interno.

### 20) GET /admin/orders-from-qr
Busca orden por QR.

Auth: Bearer token + rol ADMIN, SUPERVISOR, SELLER o LOGISTICA

Body o query:
- `qrCodeId`: string. Prefijos soportados:
  - `entelequia-{orderId}`
  - `fastmail-{guiaId}`
  - `meli-{shipmentId}`
  - sin prefijo = orderId directo

Respuesta:

```json
{ "shipment": { /* Shipment */ }, "order": { /* Order */ } }
```

### 21) PUT /admin/orders-from-qr/{orderIdOrShipmentId}
Actualiza estado desde escaneo QR.

Auth: Bearer token + rol ADMIN, SUPERVISOR, SELLER o LOGISTICA

Body (JSON):

```json
{
  "shipmentState": "EN CAMINO",
  "courier": "Correo Argentino",
  "isOrderId": true
}
```

Estados validos:
- `EN CAMINO`
- `SIN DESPACHAR`
- `ENTREGADO`
- `LISTO PARA RETIRAR`

Respuesta:

```json
{ "message": "Estado actualizado a EN CAMINO con mensajería Correo Argentino" }
```

Errores:
- 422: estado invalido.

## Estados de orden
Valores definidos en codigo:
- `Pendiente de pago`
- `Esperando aprobación por pago con transferencia bancaria`
- `Pago fallido`
- `En preparación`
- `En espera`
- `Listo para retirar`
- `En camino`
- `Completado`
- `Cancelado`

## Diferencias con docs legacy
- En este backend el listado de ordenes del cliente es `GET /api/v1/account/orders` (no `GET /api/orders/:id`).
- No hay endpoint publico sin autenticacion para ordenes.
