# Productos API - Interacciones completas (Entelequia)

Version: 1.0
Fecha: 2026-02-04
Fuente de verdad: codigo Laravel (routes/api.php + controllers + repositories + resources)

## Alcance

Este documento describe todos los endpoints de productos expuestos por el backend Laravel (api/v1), incluyendo endpoints publicos y endpoints admin. El objetivo es replicar todas las llamadas posibles desde N8N.

## Base URL

- Produccion: https://entelequia.com.ar/api/v1
- Local: http://127.0.0.1:8000/api/v1 (si corres `php artisan serve`)

## Autenticacion

- Endpoints publicos: sin autenticacion.
- Endpoints admin: requieren `Authorization: Bearer <access_token>` (Laravel Passport) y rol permitido.
- Roles permitidos en admin/products: `ADMIN`, `SUPERVISOR`, `SELLER`.
- Obtencion de token: `POST /api/v1/login` devuelve `access_token`.

## SLA, rate limits y disponibilidad

- No hay SLA ni rate limit declarados en el repo.
- No hay middleware de throttle en routes/api.php.
- Recomendacion para N8N: usar timeouts y retry con backoff ante 5xx y 429 si se implementa en infra.

## Convenciones comunes

- Headers recomendados: `Accept: application/json`.
- `Content-Type: application/json` (en endpoints GET puede omitirse).
- Paginacion: `?page=` (Laravel paginator). Tamaño de pagina fijo segun endpoint.
- Moneda: `?currency=ARS` (default ARS). Si se pasa una moneda inexistente en la tabla `currencies`, el endpoint falla.

## Esquemas comunes

### Money

Todos los precios se serializan como:

```json
{
  "currency": "ARS",
  "amount": 2500.0
}
```

### ProductResource (listas)

Campos devueltos en listados de productos:

```json
{
  "id": 12345,
  "slug": "one-piece-vol-100",
  "title": "One Piece Vol. 100",
  "images": [
    {
      "id": 1,
      "product_id": 12345,
      "path": "products/one-piece-100.jpg",
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "stock": 15,
  "price": { "currency": "ARS", "amount": 2500.0 },
  "discount_percent": 10.0,
  "priceWithDiscount": { "currency": "ARS", "amount": 2250.0 },
  "categories": [{ "id": 5, "slug": "manga", "name": "Manga" }],
  "discountsByPurchaseUnits": null
}
```

### ProductCollection (listas con paginacion)

```json
{
  "data": [
    /* ProductResource */
  ],
  "pagination": {
    "total": 100,
    "count": 20,
    "per_page": 20,
    "current_page": 1,
    "total_pages": 5
  }
}
```

### ProductDetailResource (detalle)

```json
{
  "id": 12345,
  "categories": [
    /* Category model */
  ],
  "title": "...",
  "isbn": "...",
  "dimensions": {
    /* ProductDimension */
  },
  "number_of_pages": 200,
  "tags": [
    /* ProductTags */
  ],
  "format": "...",
  "language": "...",
  "videos": null,
  "authors": [
    /* Author model */
  ],
  "authorProducts": [
    /* ProductResource */
  ],
  "brand": {
    /* Brand model */
  },
  "images": [
    /* ProductImage model */
  ],
  "description": "...",
  "price": { "currency": "ARS", "amount": 2500.0 },
  "discount_percent": 10.0,
  "priceWithDiscount": { "currency": "ARS", "amount": 2250.0 },
  "stock": 15,
  "stocks": { "Belgrano": 3, "Centro": 12 },
  "relatedProducts": [
    /* ProductResource */
  ],
  "its_on_presale": false,
  "discountsByPurchaseUnits": null,
  "is_pack": false,
  "packedProducts": [
    /* ProductResource */
  ],
  "packs": [
    /* ProductResource */
  ],
  "main_variant_id": null,
  "is_main_variant": true,
  "variants": [
    /* ProductResource */
  ]
}
```

### OfferProductResource (ofertas)

```json
{
  "id": 12345,
  "slug": "one-piece-vol-100",
  "title": "One Piece Vol. 100",
  "path": "products/one-piece-100.jpg",
  "price": { "currency": "ARS", "amount": 2500.0 },
  "valid_to": "2026-02-10",
  "discountPercent": 10.0,
  "priceWithDiscount": { "currency": "ARS", "amount": 2250.0 }
}
```

## Endpoints publicos de productos

### 1) GET /product/{idOrSlug}

Detalle de un producto por ID numerico o slug.

Auth: none
Paginacion: no

Parametros:

- Path: `idOrSlug` puede ser ID numerico o slug.
- Query: `currency` (opcional, default ARS).

Notas:

- Si el slug es solo digitos, se interpreta como ID.
- `stocks` solo incluye almacenes con stock > 0 (Belgrano, Centro).

Ejemplo:

```bash
curl "https://entelequia.com.ar/api/v1/product/one-piece-vol-100"
```

Respuesta:

```json
{
  "product": {
    /* ProductDetailResource */
  }
}
```

### 2) GET /products-list/{categorySlug?}

Busqueda/listado de productos, con filtros.

Auth: none
Paginacion: si (per_page = 20)

Parametros de path:

- `categorySlug` (opcional): filtra por categoria y sus subcategorias.

Parametros de query:

- `q` (opcional): texto de busqueda.
- `idioma` (opcional): filtra por `language`.
- `formato` (opcional): filtra por `format`.
- `editorial` (opcional): slug de brand.
- `autor` (opcional): slug de author.
- `precioMin` (opcional): numero.
- `precioMax` (opcional): numero.
- `ofertas` (opcional): `true` para solo ofertas.
- `orderBy` (opcional): `title`, `price`, `bestseller` o default `recent`.
- `page` (opcional): pagina.
- `currency` (opcional): moneda para conversion de precios.

Notas:

- Sin `categorySlug` devuelve solo `products`.
- Con `categorySlug` y sin `ofertas=true`, la respuesta incluye `offers` con productos en oferta de esa categoria.
- `bestseller` usa conteo de items vendidos en `order_items`.

Ejemplos:

```bash
curl "https://entelequia.com.ar/api/v1/products-list?q=manga&orderBy=recent"
curl "https://entelequia.com.ar/api/v1/products-list/manga?ofertas=true"
```

Respuesta:

```json
{
  "products": {
    /* ProductCollection */
  },
  "offers": {
    /* ProductCollection */
  }
}
```

`offers` puede ser `null`.

### 3) GET /products/latest

Ultimos productos publicados.

Auth: none
Paginacion: si (per_page = 20, max total = 100)

Parametros de query:

- `page` (opcional)
- `currency` (opcional)

Notas:

- Limita a 100 items maximos (5 paginas).
- Solo incluye productos con stock > 0.

Ejemplo:

```bash
curl "https://entelequia.com.ar/api/v1/products/latest?page=1"
```

Respuesta:

```json
{
  /* ProductCollection */
}
```

### 4) GET /products/recommended

Productos recomendados.

Auth: none
Paginacion: si (per_page = 20)

Parametros de query:

- `page` (opcional)
- `currency` (opcional)

Notas:

- Lista todos los productos con `is_recommended = 1`.

Ejemplo:

```bash
curl "https://entelequia.com.ar/api/v1/products/recommended"
```

Respuesta:

```json
{
  /* ProductCollection */
}
```

### 5) GET /products/offer

Productos en oferta.

Auth: none
Paginacion: si (per_page = 21)

Parametros de query:

- `page` (opcional)
- `currency` (opcional)

Notas:

- Combina ofertas del sistema (`current_offer_id`) con productos `is_in_offer=1`.
- Filtra items sin stock.

Ejemplo:

```bash
curl "https://entelequia.com.ar/api/v1/products/offer"
```

Respuesta:

```json
{
  "data": [
    /* OfferProductResource */
  ],
  "pagination": {
    /* ... */
  }
}
```

### 6) GET /products/presale

Productos en preventa.

Auth: none
Paginacion: si (per_page = 20)

Parametros de query:

- `page` (opcional)
- `currency` (opcional)

Ejemplo:

```bash
curl "https://entelequia.com.ar/api/v1/products/presale"
```

Respuesta:

```json
{
  /* ProductCollection */
}
```

### 7) GET /products/suggestions

Autocomplete de productos.

Auth: none
Paginacion: no

Parametros de query:

- `search` (opcional): texto de busqueda.
- `currency` (opcional)

Notas:

- Devuelve hasta 5 resultados.
- Busca por `search_term` o `isbn`.

Ejemplo:

```bash
curl "https://entelequia.com.ar/api/v1/products/suggestions?search=one+piece"
```

Respuesta:

```json
[
  /* ProductResource */
]
```

### 8) GET /products/brands

Listado de brands.

Auth: none
Paginacion: no

Respuesta:

```json
{
  "brands": [
    /* Brand model */
  ]
}
```

### 9) GET /products/authors

Listado de authors con filtro.

Auth: none
Paginacion: no

Parametros de query:

- `search` (opcional): filtra por nombre (LIKE). Si no se envia, devuelve los primeros 15.

Respuesta:

```json
{
  "authors": [
    /* Author model */
  ]
}
```

### 10) GET /products-export/facebook/{currency}

Exporta catalogo Facebook (archivo CSV).

Auth: none
Paginacion: no

Parametros de path:

- `currency`: `ARS` o `USD`.

Respuesta:

- Descarga de archivo CSV.

Errores:

- Moneda invalida: lanza excepcion (500).

### 11) GET /products-export/google/{currency}

Exporta catalogo Google Merchant (XML).

Auth: none
Paginacion: no

Parametros de path:

- `currency`: `ARS` o `USD`.

Respuesta:

- Descarga de archivo XML.

Errores:

- Moneda invalida: lanza excepcion (500).

## Endpoints admin de productos

### 12) GET /admin/products

Listado de productos (admin).

Auth: Bearer token + rol (ADMIN, SUPERVISOR, SELLER)
Paginacion: si (per_page = 20)

Parametros de query:

- `query` (opcional): texto de busqueda (title o isbn).
- `category` (opcional): category id.
- `state` (opcional): `si` (publicado) o `no` (no publicado).
- `warehouse` (opcional): `agotado` o cualquier otro valor para con stock.
- `mlState` (opcional): `paused`, `active`, `error`, `paused_out_of_stock`, o vacio.
- `ebayState` (opcional): `paused`, `active`, `error`, `paused_out_of_stock`, o vacio.
- `brand` (opcional): brand id.
- `author` (opcional): author id.
- `tags` (opcional): string parcial.
- `onlyPacks` (opcional): `yes`.
- `page` (opcional).
- `currency` (opcional).

Respuesta:

```json
{
  "data": [
    /* ShortProductResource */
  ],
  "pagination": {
    /* ... */
  }
}
```

### 13) GET /admin/products/{id}

Detalle de producto (admin).

Auth: Bearer token + rol (ADMIN, SUPERVISOR, SELLER)
Paginacion: no

Respuesta:

```json
{
  /* Admin ProductResource */
}
```

### 14) GET /admin/products-export

Lanza exportacion asincronica de catalogo (admin).

Auth: Bearer token + rol (ADMIN, SUPERVISOR, SELLER)

Respuesta:

- 200 sin body. El archivo se genera en background.

### 15) GET /admin/products-export-download?name=ARCHIVO

Descarga archivo exportado (admin).

Auth: Bearer token + rol (ADMIN, SUPERVISOR, SELLER)

Respuesta:

- Descarga `xlsx` desde `storage/app/public/export_catalog/`.

Errores:

- 403 si no existe.

### 16) GET /admin/products-google-export

Descarga ZIP con export Google (admin).

Auth: Bearer token + rol (ADMIN, SUPERVISOR, SELLER)

Respuesta:

- Descarga `google-merchant-export.zip`.

### 17) GET /admin/products-facebook-export

Descarga ZIP con export Facebook (admin).

Auth: Bearer token + rol (ADMIN, SUPERVISOR, SELLER)

Respuesta:

- Descarga `facebook-catalog-export.zip`.

## Errores esperados (publicos y admin)

- 401: token invalido o ausente en endpoints admin.
- 403: token valido pero rol no autorizado.
- 404: producto o categoria no encontrada.
- 500: errores internos, moneda invalida en export, etc.

## Diferencias con docs legacy

- En este backend NO existe `/api/products/search`. La busqueda real es `/api/v1/products-list`.
- En este backend NO existe `?limit=` en busqueda publica. El limite es fijo (20).
- `category` es parte del path (`/products-list/{categorySlug}`), no query param.
