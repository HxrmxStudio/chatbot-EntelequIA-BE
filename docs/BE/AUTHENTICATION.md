# Authentication en el backend (Entelequia)

Version: 1.0  
Fecha: 2026-02-10  
Fuente de verdad: `config/auth.php`, `routes/api.php`, `routes/web.php`, `bootstrap/app.php`, controllers/middlewares mencionados.

## 0) Resumen (que existe hoy)

Este backend maneja autenticacion en 2 planos distintos:

- **API (`/api/v1/...`)**: `Authorization: Bearer <access_token>` usando **Laravel Passport** (tokens emitidos con `createToken(...)`).
- **Web (sesion / cookies)**: middleware `auth` (guard `web`) para herramientas internas bajo `/server/*` (ej: Adminer) y para el “staging gate” (`checkStagingAccess`).

Y adicionalmente gestiona **credenciales/tokens para integraciones** (eBay, MercadoLibre, Openpay, Getnet, MODO) para autenticar requests salientes hacia terceros.

---

## 1) Guards, drivers y user providers

### 1.1 Configuracion base

En `config/auth.php`:

- Default guard: `env('AUTH_GUARD', 'web')`
- Guards:
  - `web`: `driver = session`, `provider = users`
  - `api`: `driver = passport`, `provider = custom_provider`

### 1.2 Modelo de usuario

- Modelo: `App\Entities\User` (`app/Entities/User.php`)
- Traits clave:
  - `Laravel\Passport\HasApiTokens` (necesario para `createToken(...)`)
  - `Illuminate\Notifications\Notifiable`
- Nota: el modelo implementa `Tymon\JWTAuth\Contracts\JWTSubject`, pero **en este repo el guard `api` esta configurado con Passport**, no con `tymon/jwt-auth` (no hay `config/jwt.php` y no se usa `JWTAuth` en controllers).

### 1.3 Password hashing (compatibilidad WordPress)

La app usa hashing/verificacion tipo WordPress via `mikemclin/laravel-wp-password`:

- Hash: `WpPassword::make(...)`
- Verify: `WpPassword::check($plain, $hash)`

Se ve en:

- `app/Http/Controllers/Auth/LoginController.php`
- `app/Http/Controllers/Auth/RegistrationController.php`
- `app/Http/Controllers/Auth/RecoverPasswordController.php`
- `app/Traits/InteractsWithFacebookGraphApi.php`
- `app/Http/Controllers/GoogleLoginController.php`
- `app/Http/Controllers/Customer/AccountController.php`
- `app/Http/Controllers/Admin/AccountController.php`

### 1.4 Custom user provider (wp_user_provider)

En `app/Providers/AuthServiceProvider.php` se registra un provider:

- Driver: `wp_user_provider`
- Implementacion: `App\Extension\PhpassEloquentProvider` (`app/Extension/PhpassEloquentProvider.php`)
- Proposito: validar credenciales con `WpPassword::check(...)` cuando se use un flujo basado en provider.
- Nota de seguridad: `PhpassEloquentProvider::validateCredentials(...)` contiene `logger($plainPassword)` (loggea el password en claro si ese flujo se ejecuta).

---

## 2) Autenticacion de API (Passport Bearer token)

### 2.1 Como se obtiene el token

Los tokens usados por el frontend/consumidores de la API se emiten de forma “in-app” (no via un flow OAuth desde el cliente) con:

```php
auth()->user()->createToken('authToken')->accessToken;
```

Esto crea un **Personal Access Token** de Passport y devuelve el string `access_token` que el cliente debe usar como Bearer token.

Requisitos para que esto funcione en un entorno nuevo:

- Migrations de Passport aplicadas (tablas `oauth_*`, ver `database/migrations/2024_09_13_*.php`)
- Keys de Passport generadas (ej: `storage/oauth-private.key` y `storage/oauth-public.key`) o seteadas por env (`PASSPORT_PRIVATE_KEY`, `PASSPORT_PUBLIC_KEY`)
- Personal access client existente (tipicamente lo crea `passport:install`)

Referencia operativa: `LOCAL_SETUP.md` incluye `php artisan passport:install`.

### 2.2 Como se usa el token

En requests a endpoints protegidos:

```
Authorization: Bearer <access_token>
Accept: application/json
```

En `routes/api.php` los endpoints protegidos usan middleware:

- `auth:api` (valida el token con Passport y setea `$request->user()`)
- `checkUserType:<roles...>` (autorizacion por rol)

#### Apache (pasaje del header Authorization)

Si la app corre bajo Apache, `public/.htaccess` incluye reglas para exponer `Authorization` a PHP:

- `RewriteCond %{HTTP:Authorization} .`
- `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`

Si se corre detras de otro proxy (Nginx/ALB/etc), se debe asegurar un equivalente para forwardear el header.

### 2.3 Endpoints OAuth nativos de Passport (`/oauth/*`)

Por defecto Passport registra rutas bajo el prefix `oauth` (ver `vendor/laravel/passport/routes/web.php`), incluyendo:

- `POST /oauth/token` (issue token)
- `GET|POST|DELETE /oauth/authorize` (auth code consent)
- `GET/POST/PUT/DELETE /oauth/clients`, `/oauth/tokens`, `/oauth/personal-access-tokens`, etc (gestion de OAuth clients/tokens)

En este backend el flujo “principal” consumido por frontend no usa estas rutas: emite tokens via `createToken(...)` en endpoints custom (`/api/v1/login`, login social, recover-password-validation).

### 2.4 Vida util del token

En este repo no hay overrides de expiracion (`Passport::tokensExpireIn(...)`, etc). Por default Passport usa:

- Personal access tokens: **1 anio** (ver `vendor/laravel/passport/src/Passport.php`, `new DateInterval('P1Y')`).

No hay refresh token implementado para “sesiones de usuario” (los refresh tokens son parte del stack OAuth, pero la app no expone un flujo de refresh para el cliente).

---

## 3) Flujos de login / registro (endpoints)

Todos estos endpoints estan en `routes/api.php` bajo prefix `v1` (o sea `/api/v1/...`).

### 3.1 Login con email y password

- Endpoint: `POST /api/v1/login`
- Codigo: `app/Http/Controllers/Auth/LoginController.php`

Request JSON:

```json
{ "email": "user@dominio.com", "password": "..." }
```

Proceso:

1. Busca el usuario por email.
2. Verifica password con `WpPassword::check(...)`.
3. `auth()->login($user)` (setea el user en el request actual).
4. Emite token Passport: `createToken('authToken')->accessToken`.
5. Responde:

```json
{ "user": { /* ... */ }, "access_token": "..." }
```

Errores:

- `401` si credenciales invalidas.

### 3.2 Registro (creacion de usuario)

- Endpoint: `POST /api/v1/registration`
- Codigo: `app/Http/Controllers/Auth/RegistrationController.php`

Proceso (alto nivel):

1. Valida request con `app/Http/Requests/UserRegistrationRequest.php`.
2. Verifica que no exista usuario con el mismo email.
3. Hashea password con `WpPassword::make(...)`.
4. Crea `User` y crea entidad `Client`.
5. (Opcional) registra newsletter via `PerfitGateway`.

Importante:

- Este endpoint **no devuelve `access_token`**. Para autenticar, el cliente debe hacer login luego.

### 3.3 Login con Facebook

- Endpoint: `POST /api/v1/login/facebook`
- Codigo: `app/Http/Controllers/Auth/FacebookAuthController.php` + `app/Traits/InteractsWithFacebookGraphApi.php`

Request:

```json
{ "access_token": "<facebook_user_access_token>" }
```

Proceso:

1. Obtiene **App Access Token** de Facebook (client credentials).
2. Valida el token de usuario via `/debug_token`.
3. Busca `SocialIdentity` por `provider_id` (Facebook user id).
4. Si no existe, pide datos `/me?fields=...` y crea:
   - `User` (rol `client`, password random hasheado con `WpPassword::make(...)`)
   - `Client`
   - `SocialIdentity`
5. Loguea y emite token Passport.

Variables de entorno usadas:

- `FACEBOOK_API_CLIENT_ID`
- `FACEBOOK_API_SECRET_KEY`

### 3.4 Login con Google

Rutas (ambas en `routes/api.php`):

- `GET /api/v1/login/google` (`redirectToGoogle`): devuelve `googleUrl` (URL de consentimiento).
- `POST /api/v1/login/google` (`loginOrRegister`): obtiene el usuario Google via Socialite, crea/encuentra el usuario local y emite token.

Codigo: `app/Http/Controllers/GoogleLoginController.php`

Notas del flujo:

- Se usa `Socialite::driver('google')->stateless()`.
- El callback real depende de `GOOGLE_REDIRECT_URL` (en `config/services.php`).
- La app identifica usuario por email; si no existe crea `User` + `Client` + `SocialIdentity(provider_name="google")`.

Variables de entorno:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL`

### 3.5 Recupero de password (token por email)

Endpoints:

- `POST /api/v1/recover-password`
- `POST /api/v1/recover-password-validation`

Codigo: `app/Http/Controllers/Auth/RecoverPasswordController.php`

Paso 1 (`recover`):

1. Recibe `{ email }`.
2. Genera y guarda `reset_password_token` (random de 40 chars).
3. Envia mail `App\Mail\RecoverPassword` con la view `resources/views/email/recover-password.blade.php`.
4. El mail contiene un link a frontend:
   - `https://entelequia.com.ar/recuperar-clave-validacion?email=...&token=...`

Paso 2 (`recoverValidation`):

1. Recibe `{ email, token }`.
2. Valida que el usuario exista y que `reset_password_token` coincida.
3. Loguea al usuario y emite `access_token` de Passport.

Cambio de password posterior:

- `POST /api/v1/account/renew-password` (requiere `auth:api` + rol `client`).

### 3.6 Logout / revocacion de token (estado actual)

En `app/Http/Controllers/Auth/LoginController.php` existe:

- `logout(Request $request)` que ejecuta `$request->user()->token()->revoke()` (revoca el token Passport actual).

Pero **no hay una ruta expuesta en `routes/api.php`** que apunte a este metodo (al 2026-02-10). Si se necesita logout via API, hay que agregar un endpoint (tipicamente protegido con `auth:api`).

---

## 4) Autorizacion (roles)

### 4.1 Roles disponibles

Definidos en `app/Entities/UserRole.php`:

- `client`
- `seller`
- `supervisor`
- `admin`
- `logistica`

### 4.2 Middleware de rol

`app/Http/Middleware/CheckUserType.php`:

- Lee `$request->user()->role`
- Si el rol esta en la lista permitida, deja pasar; sino `abort(403)`

Ejemplos en `routes/api.php`:

- Cliente:
  - `Route::prefix('account/')->middleware(['auth:api','checkUserType:client'])->group(...)`
- Admin:
  - `Route::prefix('admin')->middleware(['auth:api','checkUserType:admin,supervisor,seller,logistica'])->group(...)`

---

## 5) Autenticacion web (sesion) y herramientas internas (/server/*)

### 5.1 Diferencia `auth` vs `auth:api`

En `routes/web.php` hay comentarios explicitando:

- `auth` = session / cookies (guard `web`)
- `auth:api` = Passport Bearer token (guard `api`)

### 5.2 Adminer

Paquete: `onecentlin/laravel-adminer`

- Config: `config/adminer.php`
  - `route_prefix`: `server/adminer`
  - `middleware`: `adminer`
- Middleware group `adminer`: definido en `bootstrap/app.php` e incluye:
  - `EncryptCookies`
  - `StartSession`
  - `Authenticate` (equivalente a `auth`)
  - `checkUserType:admin`

### 5.3 Horizon

Paquete: `laravel/horizon`

- Path: `HORIZON_PATH` (default `horizon`), ver `config/horizon.php`
- Middleware: `['web']` (session/cookies)
- Gate: `viewHorizon` en `app/Providers/HorizonServiceProvider.php` permite solo `role === admin`
- Nota: en `APP_ENV=staging` el provider hace `return` en `boot()` y no inicializa Horizon.

### 5.4 Telescope

Paquete: `laravel/telescope`

- Path: `TELESCOPE_PATH` (default `server/telescope`), ver `config/telescope.php`
- Middleware: `web` + `Laravel\Telescope\Http\Middleware\Authorize`
- Gate: `viewTelescope` en `app/Providers/TelescopeServiceProvider.php` permite solo emails en allowlist (hoy: `tomas@entelequia.com.ar`)

### 5.5 Log Viewer

Paquete: `opcodesio/log-viewer`

- Path: `server/log-viewer` (`config/log-viewer.php`)
- Middleware UI: `web` + `AuthorizeLogViewer`
- En produccion: `require_auth_in_production = true`

### 5.6 Rutas `/server/login`

En `routes/web.php` existen rutas `/server/login` y `/server/logout`, pero **en este snapshot del repo** no existe `App\Server\LoginServerController` (ni otros `App\Server\...` referenciados). Esto rompe `php artisan route:list` y sugiere que:

- o falta codigo (no incluido en este repo / branch),
- o son rutas legacy que deberian eliminarse/actualizarse.

---

## 6) Gate extra en staging (checkStagingAccess)

`app/Http/Middleware/CheckStagingAccess.php`:

- Solo aplica si `app()->environment('staging')`.
- Requiere visitar una URL “secreta” para setear un flag en session (`staging_access_granted`):
  - `https://staging.entelequia.com.ar/staging/88Tnc-2ryZScdg5p7W__4fWYMVSqiV`
- Si no existe el flag, redirige a `https://entelequia.com.ar`.

Nota: el “code” esta hardcodeado en el middleware; si se quiere rotar/operar de forma mas segura, conviene moverlo a `.env`/config.

Este middleware envuelve las rutas web en `routes/web.php` (no las de API).

---

## 7) Integraciones: autenticacion contra terceros (saliente)

Esto no autentica usuarios contra Entelequia, pero si define como el backend se autentica cuando consume APIs externas.

### 7.1 eBay (OAuth)

Rutas web:

- `GET|POST /auth` (pantalla/flow de consentimiento)
- `GET /auth/accepted` (callback con `code`)
- `GET /auth/declined`

Codigo:

- `app/Http/Controllers/Admin/Ebay/EbayAuthController.php`
- `app/Service/Ebay/EbayAccessTokenService.php`

Resumen:

- Intercambia `authorization_code` por `access_token` y `refresh_token`.
- Refresca con `grant_type=refresh_token` cuando esta cerca de expirar.
- Guarda tokens/expiraciones en `EbayCredential`.

### 7.2 MercadoLibre (refresh programado)

Codigo: `app/Service/Meli/MeliAccessTokenRefresher.php`

- Job/command corre por scheduler (ver `bootstrap/app.php`: `meli:refresh:access-token` cada 30 min).
- Usa `refresh_token` y env vars `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET`, `MELI_REDIRECT_URL`.
- Persiste tokens en `MeliCredential` via repo.

### 7.3 Openpay (client credentials, cache)

Codigo: `app/Service/Openpay/OpenpayAccessTokenService.php`

- Pide token con `grant_type=client_credentials`.
- Cachea el token en `Cache` por 10 minutos.

### 7.4 Getnet / MODO (Bearer tokens para requests salientes)

Codigos:

- `app/Service/Getnet/GetnetRestClient.php` (+ su access token service)
- `app/Service/MODO/MODORestClient.php` (+ su access token service)

Ambos:

- Setean `Authorization: Bearer <token>` en headers salientes.

---

## 8) Errores tipicos y debugging

- `401 Unauthorized`
  - Falta `Authorization` header o token invalido/revocado/expirado.
  - Asegurar `Accept: application/json` (la app customiza el middleware `Authenticate` en `app/Http/Middleware/Authenticate.php`).
  - Si estas detras de Apache/proxy, asegurar que el header Authorization llegue a PHP (ver `public/.htaccess`).
- `403 Forbidden`
  - El token es valido, pero el rol no esta permitido por `checkUserType`.
- “Token expirado”
  - No hay refresh token para el cliente: se re-autentica con `/api/v1/login` o flujo social correspondiente.
