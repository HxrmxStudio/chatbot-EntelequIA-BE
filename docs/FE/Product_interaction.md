**Alcance**

- Integración de endpoints públicos y admin de productos para n8n.
- Uso de `api/v1` como base.
- Incluye pautas para flujos de chatbot (búsqueda on‑demand).

**Base URL**

- Producción: `https://entelequia.com.ar/api/v1`
- Local: `http://127.0.0.1:8000/api/v1`

**Headers estándar**

- `Accept: application/json`
- `Content-Type: application/json` (en GET es opcional)

**Autenticación**

- Públicos: sin auth.
- Admin: `Authorization: Bearer <access_token>` (roles: ADMIN, SUPERVISOR, SELLER).
- Token: `POST /login` (no detallado en el doc, confirmar payload en backend).

**Convenciones clave**

- Paginación: `?page=`
- Moneda: `?currency=ARS` (si no existe en `currencies`, falla).
- Per‑page fijo en cada endpoint, no hay `limit`.

---

**Variables recomendadas en n8n**

- `ENTELEQUIA_API_BASE` = base URL (`https://entelequia.com.ar/api/v1`)
- `CURRENCY_DEFAULT` = `ARS`

---

**Flujo recomendado para chatbot (búsqueda on‑demand)**

1. **HTTP Request** → `GET /products-list` con `q` y `currency`.
2. **Function / Code** → seleccionar mejor match por título y volumen.
3. **IF** → si `stock > 0` responder “sí hay stock”.
4. **Opcional**: **HTTP Request** → `GET /product/{slug}` para detalle y stock por sucursal.
5. **Responder** con título, precio, stock, link al producto.

---

## Endpoints para n8n (configuración por endpoint)

**1) Detalle de producto**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/product/{idOrSlug}`
- Auth: no
- Query params: `currency` (opcional)
- Respuesta: `{ "product": ProductDetailResource }`
- Uso en chatbot: validar stock y sucursales.

**2) Búsqueda / listado con filtros**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products-list/{categorySlug}`
- Auth: no
- Query params:
- `q`, `idioma`, `formato`, `editorial`, `autor`, `precioMin`, `precioMax`, `ofertas`, `orderBy`, `page`, `currency`
- Respuesta:
- `products`: `ProductCollection`
- `offers`: `ProductCollection` (solo si hay `categorySlug` y `ofertas` no es `true`)
- Uso clave para chatbot.

**3) Últimos productos**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/latest`
- Query params: `page`, `currency`
- Nota: stock > 0, máximo 100 items.

**4) Recomendados**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/recommended`
- Query params: `page`, `currency`

**5) Ofertas**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/offer`
- Query params: `page`, `currency`
- Respuesta: `OfferProductResource` + paginación.

**6) Preventa**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/presale`
- Query params: `page`, `currency`

**7) Autocomplete de productos**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/suggestions`
- Query params: `search`, `currency`
- Respuesta: array `ProductResource` (máx 5).
- Nota: el front viejo usa `/search-suggestions?search=...`; confirmar si ambos existen.

**8) Brands**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/brands`
- Respuesta: `{ "brands": [...] }`

**9) Authors**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products/authors`
- Query params: `search`
- Respuesta: `{ "authors": [...] }`

**10) Export Facebook (público)**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products-export/facebook/{currency}`
- Respuesta: CSV (binario)
- N8N: configurar respuesta como archivo/binario.

**11) Export Google (público)**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products-export/google/{currency}`
- Respuesta: XML (binario)

**12) Admin list**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/admin/products`
- Auth: Bearer
- Query params: `query`, `category`, `state`, `warehouse`, `mlState`, `ebayState`, `brand`, `author`, `tags`, `onlyPacks`, `page`, `currency`
- Respuesta: `{ "data": [...], "pagination": {...} }`

**13) Admin export async**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/admin/products-export`
- Auth: Bearer
- Respuesta: 200 sin body.

**14) Admin export download**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/admin/products-export-download?name=ARCHIVO`
- Auth: Bearer
- Respuesta: `xlsx` (binario)

**15) Admin Google export (ZIP)**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/admin/products-google-export`
- Auth: Bearer
- Respuesta: `zip` (binario)

**16) Admin Facebook export (ZIP)**

- Método: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/admin/products-facebook-export`
- Auth: Bearer
- Respuesta: `zip` (binario)

---

## Manejo de errores en n8n

- `401`: token inválido o ausente en admin.
- `403`: rol no permitido.
- `404`: producto/categoría no encontrada.
- `500`: moneda inválida o error interno.

Recomendaciones:

- Validar `currency` contra `ARS|USD` antes de llamar.
- Usar reintentos con backoff para `5xx`.
- En endpoints de archivo, habilitar “respuesta como binario”.

---

## Ejemplo de configuración en n8n (búsqueda on‑demand)

**HTTP Request**

- Method: `GET`
- URL: `{{$env.ENTELEQUIA_API_BASE}}/products-list`
- Query params:
- `q`: `{{$json.query}}`
- `page`: `1`
- `currency`: `{{$json.currency || 'ARS'}}`

**Function (match simple)**

- Elegir el primer producto cuyo `title` contenga tokens como `attack on titan`, `#1`, `vol 1`, `tomo 1`.
- Preferir `stock > 0`.

---

## Observaciones importantes

- El frontend actual llama `GET /search-suggestions?search=...` pero el doc oficial indica `/products/suggestions`. Si n8n necesita autocomplete, confirmar cuál endpoint es el vigente en backend.

---
