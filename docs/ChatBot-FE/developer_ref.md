# Developer Quick Reference - Developer Implementation (Actualizado 2026)

## Stack frontend 2026: React 19 + TypeScript + Tailwind v4 + Fetch API (sin Axios)

## Chatbot E-Commerce In-House (Semanas 1-5)

## Principios de implementación (Clean Code + React)

- **Una responsabilidad por módulo**: UI (widget), orquestación (n8n), integraciones (canales externos: WhatsApp/ML), y almacenamiento (DB) separados.
- **Interfaces explícitas**: cada integración expone funciones claras (`get_order_status`, `search_products`, `create_ticket`).
- **Sin “magic strings”**: centralizar constantes, URLs y keys en config.
- **Observabilidad desde el día 1**: logs de conversación, errores, y handoff humano.

## Convenciones del proyecto

### Estrategia de despliegue (default)

- **Docker-first**: todo corre en containers (n8n + Postgres + opcional reverse proxy).
- **Reverse proxy**: Nginx o Traefik en el VPS para HTTPS y routing (`/n8n/`).
- **No exponer Postgres**: solo red interna de Docker.

### Variables de entorno (Vite vs Next.js)

- Si el widget es **Vite**: usar `VITE_*` para variables públicas.
- Si el widget es **Next.js**: usar `NEXT_PUBLIC_*` para variables públicas.
- **Nunca** commitear `.env` (solo `.env.example`).

### Estructura recomendada (frontend widget)

- `src/components/` (UI)
- `src/hooks/` (lógica)
- `src/services/` (API / transport)
- `src/types/` (types)
- `src/utils/` (helpers puros)

### Definition of Done (DoD) por PR

- `npm run lint` / `npm run typecheck` pasan (o equivalente).
- No hay secretos en el repo (`.env` fuera, `.env.example` dentro).
- Logs útiles en paths críticos (integraciones, webhooks, pagos).
- Edge cases cubiertos (inputs inválidos, timeouts, reintentos).
- Documentación mínima actualizada (README/quick ref).

---

## Gestión de Base de Datos (ACID + consistencia end-to-end)

### ACID en PostgreSQL

PostgreSQL es un motor **ACID**. Eso significa que **dentro de una transacción** (`BEGIN/COMMIT`) tenés:

- **Atomicidad**: o se aplica todo, o nada.
- **Consistencia**: constraints (FK/NOT NULL/CHECK/ENUM) se cumplen o falla.
- **Aislamiento**: por defecto `READ COMMITTED` (adecuado para la mayoría).
- **Durabilidad**: una vez confirmado, persiste (con volumen + fsync).

> Importante: **el sistema completo** (n8n + APIs externas + WhatsApp/ML/HTTP) **no es ACID end-to-end** por naturaleza. Eso se resuelve con patrones tipo saga: **idempotencia + outbox + reintentos**.

### Reglas obligatorias para flujos con Webhooks (idempotencia)

Para evitar duplicados por reintentos (WhatsApp/ML/n8n):

- Guardar un `external_event_id` (id del mensaje/evento externo).
- Crear **UNIQUE** sobre `(source, external_event_id)`.
- Insertar con `ON CONFLICT DO NOTHING` y salir si ya fue procesado.

### Outbox pattern (delivery guarantee) para side effects (WhatsApp/Email)

Para evitar el caso “DB dice enviado pero el usuario no lo recibió”:

1. En la **misma transacción** donde guardás la respuesta del bot, insertás un registro en `outbox_messages(status='pending')`.
2. Un worker (o workflow n8n) envía el mensaje y marca `status='sent'` (o `failed` con retry).
3. El worker **solo** levanta mensajes pendientes cuyo `next_retry_at` ya venció y con `attempts < max_retries`.

### Transacciones recomendadas (multi-write)

Usar transacciones para operaciones multi-write:

- `conversation` + `message` + `conversation.updated_at`
- `invoice` + `invoice_items`
- `external_event_ingest` + `message` + `outbox`

### Isolation level (cuándo subirlo)

- Default: `READ COMMITTED` ✅
- Para contabilidad/stock crítico:
  - `SELECT ... FOR UPDATE` en filas a modificar, o
  - `SERIALIZABLE` en puntos críticos (con retry).

---

## SQL — Schema v3 recomendado (idempotencia + outbox + dedupe)

> Nota: `gen_random_uuid()` requiere la extensión `pgcrypto`: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

### 1) Tipos (ENUM) para consistencia

```sql
DO $$ BEGIN
  CREATE TYPE message_sender AS ENUM ('user','bot','agent','system');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_channel AS ENUM ('web','whatsapp','mercadolibre');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE outbox_status AS ENUM ('pending','sent','failed','delivered');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE external_event_status AS ENUM ('received','processing','processed','failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
```

### 2) Timestamps automáticos (`updated_at`)

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 3) Tabla de ingesta de eventos externos (idempotencia)

```sql
CREATE TABLE IF NOT EXISTS external_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source message_channel NOT NULL,
  external_event_id TEXT NOT NULL,

  payload JSONB NOT NULL,

  status external_event_status NOT NULL DEFAULT 'received',
  error TEXT,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (source, external_event_id)
);

DO $$ BEGIN
  CREATE TRIGGER trg_external_events_updated_at
  BEFORE UPDATE ON external_events
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
```

### 4) Outbox de mensajes (envíos confiables + retries)

```sql
CREATE TABLE IF NOT EXISTS outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel message_channel NOT NULL,
  to_ref TEXT NOT NULL,                 -- phone/email/user_id según canal

  conversation_id UUID,
  message_id UUID,
  payload JSONB NOT NULL,

  status outbox_status NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

DO $$ BEGIN
  CREATE TRIGGER trg_outbox_updated_at
  BEFORE UPDATE ON outbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Query base del worker (batch)
-- SELECT * FROM outbox_messages
-- WHERE status='pending'
--   AND (next_retry_at IS NULL OR next_retry_at <= now())
--   AND attempts < max_retries
-- ORDER BY created_at ASC
-- LIMIT 100;
```

### 5) Dedupe de envíos (evitar mandar 2 veces el mismo mensaje)

> Si tu “source-of-truth” es `outbox_messages`, podés deduplicar con `UNIQUE(message_id, channel, to_ref)` directamente ahí.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_outbox_dedupe
  ON outbox_messages(message_id, channel, to_ref)
  WHERE message_id IS NOT NULL;
```

### 6) Messages: channel + id externo + índice

```sql
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel message_channel,
  ADD COLUMN IF NOT EXISTS external_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_channel_external
  ON messages(channel, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_external_event_id
  ON messages(external_event_id)
  WHERE external_event_id IS NOT NULL;
```

### 7) Índices críticos (performance)

```sql
CREATE INDEX IF NOT EXISTS idx_external_events_status_created
  ON external_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_events_source_processed
  ON external_events(source, processed_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_status_next_retry
  ON outbox_messages(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_outbox_channel_to_ref
  ON outbox_messages(channel, to_ref);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
  ON outbox_messages(status, created_at);
```

---

## Backend: ejemplo de transacción (pseudocódigo TypeScript)

```ts
// Ejemplo conceptual (Node.js + pg). La idea: idempotencia + inserts + outbox en 1 transacción.
async function processWebhook(pool, webhookPayload) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1) Idempotencia
    const existing = await client.query(
      'SELECT id FROM external_events WHERE source = $1 AND external_event_id = $2',
      [webhookPayload.source, webhookPayload.id]
    );

    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return { ok: true, deduped: true };
    }

    // 2) Insert evento
    const eventRes = await client.query(
      `INSERT INTO external_events (source, external_event_id, payload, status)
       VALUES ($1, $2, $3, 'processing')
       RETURNING id`,
      [webhookPayload.source, webhookPayload.id, webhookPayload]
    );

    // 3) Insert message (entrada del usuario)
    const msgRes = await client.query(
      `INSERT INTO messages (conversation_id, user_id, content, sender, channel, external_event_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        webhookPayload.conversationId,
        webhookPayload.userId,
        webhookPayload.text,
        'user',
        webhookPayload.source,
        webhookPayload.id,
      ]
    );

    // 4) Insert outbox (respuesta a enviar) — con dedupe UNIQUE(message_id, channel, to_ref)
    await client.query(
      `INSERT INTO outbox_messages (channel, to_ref, conversation_id, message_id, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (message_id, channel, to_ref) DO NOTHING`,
      [
        webhookPayload.source,
        webhookPayload.toRef,
        webhookPayload.conversationId,
        msgRes.rows[0].id,
        webhookPayload.replyPayload,
      ]
    );

    // 5) Mark processed
    await client.query(
      `UPDATE external_events
       SET status = 'processed', processed_at = now()
       WHERE id = $1`,
      [eventRes.rows[0].id]
    );

    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## Operación: backups + restore (mínimo aceptable)

### Backup diario (cron) + retención

```bash
# /etc/cron.daily/chatbot_pg_backup (ejemplo)
set -euo pipefail

BACKUP_DIR="/opt/chatbot/backups"
mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/chatbot_${TS}.sql.gz"

docker exec -t chatbot_db pg_dump -U chatbot_user -d chatbot | gzip > "$FILE"

# Retención 30 días
find "$BACKUP_DIR" -type f -name "chatbot_*.sql.gz" -mtime +30 -delete
```

### Restore (prueba mensual)

```bash
gunzip -c /opt/chatbot/backups/chatbot_YYYYMMDD_HHMMSS.sql.gz | docker exec -i chatbot_db psql -U chatbot_user -d chatbot
```

---

## Disaster Recovery Plan (escenarios típicos)

- **PostgreSQL cae a mitad de transacción**: Postgres hace rollback automático. El proveedor reintenta webhook; `UNIQUE(source, external_event_id)` evita duplicados.
- **Outbox worker cae**: los mensajes quedan `pending`. Al reiniciar, el worker los retoma; `next_retry_at` evita loops agresivos.
- **Desincronización “DB dice enviado”**: el envío real lo controla outbox; si falla, queda `pending/failed` con `last_error`.
- **Backup corrupto**: mantener 30 días + probar restore mensual para detectar corrupción a tiempo.

---

## Política de retención y purga (GDPR / minimización de datos)

> Ajustar según necesidad del negocio y asesoría legal. Default recomendado para MVP: **90 días** para mensajes y eventos no críticos.

### Purga automática (cron) — ejemplo

```sql
-- Mensajes antiguos
DELETE FROM messages
WHERE created_at < now() - interval '90 days';

-- (Opcional) Eventos externos ya procesados y antiguos
DELETE FROM external_events
WHERE status = 'processed'
  AND created_at < now() - interval '90 days';

-- (Opcional) Outbox “sent/failed” antiguos
DELETE FROM outbox_messages
WHERE status IN ('sent','failed','delivered')
  AND created_at < now() - interval '90 days';
```

### Cron diario (ejemplo)

```bash
# /etc/cron.daily/chatbot_gdpr_purge (ejemplo)
set -euo pipefail
docker exec -i chatbot_db psql -U chatbot_user -d chatbot <<'SQL'
DELETE FROM messages
WHERE created_at < now() - interval '90 days';
SQL
```

## Checklist DB (antes de ir a producción)

- [ ] Postgres **no** expuesto a internet (solo Docker network / localhost).
- [ ] Idempotencia aplicada en webhooks (`external_events` + UNIQUE + upsert).
- [ ] Outbox con `next_retry_at` + `max_retries` + dedupe por `(message_id, channel, to_ref)`.
- [ ] Índices creados (events/outbox/messages).
- [ ] Backups automáticos + restore probado.
- [ ] Limpieza/retención de logs y conversaciones (según GDPR/negocio).

## SEMANA 1: SETUP INICIAL

### Day 1-2: Infraestructura

```bash
# 1) SSH (usar keys, no password)
ssh root@your-vps-ip

# 2) Actualizar sistema
apt update && apt upgrade -y

# 3) Crear usuario no-root y endurecer SSH (recomendado)
adduser deploy
usermod -aG sudo deploy

# (Opcional pero recomendado) Copiar tu SSH key al usuario deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 4) Firewall básico (UFW)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# 5) (Opcional) Fail2ban
apt install -y fail2ban

# 6) Docker Engine + Compose plugin (recomendado: `docker compose`)
apt install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker compose-plugin

# 7) Permitir usar docker sin sudo (para tu usuario deploy)
usermod -aG docker deploy

# 8) Carpeta del proyecto
mkdir -p /opt/chatbot/{postgres_data,n8n_data,backups}
chown -R deploy:deploy /opt/chatbot
cd /opt/chatbot

# ✅ Re-log para que tome el grupo docker (o `newgrp docker`)
```

### Day 3-4: Base de Datos

````

### VPS Hardening (recomendado)

> Si vas a producción en VPS, aplicá hardening básico antes de exponer endpoints.

```bash
#!/bin/bash
set -euo pipefail

echo "🔒 VPS Hardening Setup"

# 1. Crear usuario no-root
echo "📝 Creando usuario deploy..."
if ! id "deploy" &>/dev/null; then
    adduser --disabled-password --gecos "" deploy
    usermod -aG sudo deploy
    usermod -aG docker deploy
    echo "✅ Usuario deploy creado"
else
    echo "⚠️ Usuario deploy ya existe"
fi

# 2. Copiar SSH keys
echo "🔑 Configurando SSH..."
mkdir -p /home/deploy/.ssh
if [ -f ~/.ssh/authorized_keys ]; then
    cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    echo "✅ SSH keys configuradas"
fi

# 3. Firewall (UFW)
echo "🔥 Configurando firewall..."
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

echo "✅ Firewall habilitado"
ufw status

# 4. Fail2Ban (protección brute-force)
echo "🛡️ Instalando Fail2Ban..."
apt-get install -y fail2ban

cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log

EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "✅ Fail2Ban configurado"

# 5. SSH Hardening
echo "🔐 Endureciendo SSH..."
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/#X11Forwarding yes/X11Forwarding no/' /etc/ssh/sshd_config

# Port change (OPCIONAL - descomentar)
# sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config

systemctl restart sshd
echo "✅ SSH hardened"

# 6. Limits del sistema
echo "📊 Configurando limits..."
cat >> /etc/security/limits.conf <<EOF

# Chatbot limits
deploy soft nofile 65536
deploy hard nofile 65536
deploy soft nproc 32768
deploy hard nproc 32768
EOF

echo "✅ Limits configurados"

# 7. Sysctl (network hardening)
echo "🌐 Network hardening..."
cat >> /etc/sysctl.conf <<EOF

# IP forwarding (desactivado)
net.ipv4.ip_forward = 0

# Syn flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_timestamps = 1

# ICMP redirects (off)
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0

# Source packet routing (off)
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Bad error message protection
net.ipv4.icmp_ignore_bogus_error_responses = 1

# TCP hardening
net.ipv4.tcp_rfc1337 = 1

EOF

sysctl -p
echo "✅ Network hardening aplicado"

# 8. Actualizar sistema
echo "🔄 Actualizando sistema..."
apt-get update
apt-get upgrade -y
apt-get autoremove -y
echo "✅ Sistema actualizado"

# 9. Instalar tools útiles
echo "🛠️ Instalando tools..."
apt-get install -y \
    curl \
    wget \
    git \
    htop \
    net-tools \
    openssl \
    jq \
    tree

echo "✅ Tools instalados"

# 10. Crear cronjob para seguridad
echo "⏰ Configurando auditoría..."
cat > /etc/cron.weekly/security-audit <<EOF
#!/bin/bash
# Hacer backup de configuraciones críticas
tar -czf /opt/chatbot/backups/config-\$(date +%Y%m%d).tar.gz \
  /etc/nginx \
  /etc/ssh \
  /etc/docker

# Verificar permisos de archivos críticos
find /home/deploy -type f -perm /077 -printf "⚠️ Archivo con permisos inseguros: %p\n"

# Verificar logs de security
grep "Invalid user" /var/log/auth.log | tail -n 5
EOF

chmod +x /etc/cron.weekly/security-audit
echo "✅ Auditoría configurada"

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ VPS Hardening completado"
echo "═══════════════════════════════════════════════════"
echo ""
echo "SIGUIENTES PASOS:"
echo "1. Re-login con usuario 'deploy'"
echo "2. Verificar UFW: sudo ufw status"
echo "3. Verificar Fail2Ban: sudo fail2ban-client status"
echo "4. Verificar SSH: sudo sshd -t"
echo ""
echo "⚠️ IMPORTANTE: Guardar SSH keys en lugar seguro"
echo ""
````

bash

# 1) Generar secretos (no hardcodear)

DB_PASSWORD="$(openssl rand -base64 32)"
N8N_USER="admin"
N8N_PASSWORD="$(openssl rand -base64 20)"
N8N_ENCRYPTION_KEY="$(openssl rand -hex 32)"
DOMAIN="yourdomain.com"

# 2) Crear .env (NUNCA commitear)

cat > .env <<EOF
DB_PASSWORD=$DB_PASSWORD
N8N_USER=$N8N_USER
N8N_PASSWORD=$N8N_PASSWORD
N8N_ENCRYPTION_KEY=$N8N_ENCRYPTION_KEY
DOMAIN=$DOMAIN
OPENAI_API_KEY=sk-...your-key...
EOF

# 3) docker-compose.yml (Postgres NO expuesto públicamente)

cat > docker-compose.yml <<'EOF'
version: "3.8"

services:
postgres:
image: postgres:15-alpine
container_name: chatbot_db
environment:
POSTGRES_DB: chatbot
POSTGRES_USER: chatbot_user
POSTGRES_PASSWORD: ${DB_PASSWORD}
volumes: - ./postgres_data:/var/lib/postgresql/data
expose: - "5432"
restart: unless-stopped
healthcheck:
test: ["CMD-SHELL", "pg_isready -U chatbot_user -d chatbot"]
interval: 10s
timeout: 5s
retries: 5

n8n:
image: n8nio/n8n:latest
container_name: chatbot_n8n
environment: - N8N_BASIC_AUTH_ACTIVE=true - N8N_BASIC_AUTH_USER=${N8N_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD} - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}

      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=chatbot
      - DB_POSTGRESDB_USER=chatbot_user
      - DB_POSTGRESDB_PASSWORD=${DB_PASSWORD}

      - NODE_ENV=production
      # Recomendado detrás de Nginx/Traefik:
      - N8N_HOST=${DOMAIN}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://${DOMAIN}/n8n/
      - N8N_EDITOR_BASE_URL=https://${DOMAIN}/n8n/
      - TZ=Europe/Madrid
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./n8n_data:/home/node/.n8n
    # Exponer solo en localhost (Nginx/Traefik hará el proxy)
    ports:
      - "127.0.0.1:5678:5678"
    restart: unless-stopped

EOF

# 4) Levantar servicios

docker compose up -d
docker compose ps
docker compose logs -f n8n

````

### Day 5: Credenciales

```bash
# 1. OpenAI
# - Ir a https://platform.openai.com/api/keys
# - Crear key
# - Guardar en .env: OPENAI_API_KEY=sk-...

# 2. Backend API de negocio
# - Definir URL base de la API (ej: https://api.tu-dominio.com)
# - Crear API key/HMAC secret para el chatbot
# - Guardar en .env: BUSINESS_API_URL=... y BUSINESS_API_KEY=...

# 3. WhatsApp Business
# - https://developers.facebook.com
# - Create Business App
# - Add WhatsApp product
# - Verify phone number
# - Guardar Access Token

# 4. Mercado Libre
# - https://developers.mercadolibre.com.ar
# - Create app
# - Guardar Client ID + Secret

# GUARDAR TODO EN .env (NUNCA EN GIT!)
````

---

## SEMANA 2: FRONTEND WIDGET - MODERNO (TypeScript + Tailwind v4 + Fetch)

### React Setup Actualizado (2026)

```bash
# Crear proyecto Vite + React + TypeScript
npm create vite@latest chatbot-widget -- --template react
cd chatbot-widget

# Instalar dependencias (state management)
npm install zustand
npm install -D typescript @types/node @types/react @types/react-dom

# ✅ Tailwind v4 (instalación correcta - 2026)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Verificar
npm ls tailwindcss
# ✅ tailwindcss@4.x.x

# Crear estructura
mkdir -p src/{components,hooks,types,services,utils,assets}
```

---

### Configuración TypeScript + Tailwind v4

### tsconfig.json - ACTUALIZADO PARA REACT 19

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForEnumMembers": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@services/*": ["./src/services/*"],
      "@types/*": ["./src/types/*"],
      "@utils/*": ["./src/utils/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### tailwind.config.js - NUEVO FORMATO v4

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        chat: {
          user: '#e3f2fd',
          bot: '#f5f5f5',
          error: '#fee2e2',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['Fira Code', 'monospace'],
      },
      animation: {
        typing: 'typing 0.7s steps(4, end)',
      },
      keyframes: {
        typing: {
          from: { width: '0' },
          to: { width: '2rem' },
        },
      },
    },
  },
  plugins: [],
  // Opcional: configuración de deshabilitar plugins
  corePlugins: {
    // preflight: false, // Si necesitas deshabilitar resets base
  },
};
```

### postcss.config.js - Para Tailwind v4

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### src/index.css - Tailwind v4 (correcto)

```css
/* ✅ FORMA CORRECTA PARA TAILWIND v4 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom components usando @layer */
@layer components {
  /* Chat Buttons */
  .chat-btn {
    @apply px-4 py-2 bg-brand-600 text-white rounded-lg 
           hover:bg-brand-700 transition-all duration-200 
           font-medium disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .chat-btn-secondary {
    @apply px-4 py-2 bg-gray-200 text-gray-900 rounded-lg 
           hover:bg-gray-300 transition-all duration-200 
           font-medium disabled:opacity-50;
  }

  /* Chat Inputs */
  .chat-input {
    @apply flex-1 border border-gray-300 rounded-full px-4 py-2
           text-sm focus:outline-none focus:border-brand-600 
           focus:ring-2 focus:ring-brand-600/20 
           disabled:opacity-50 disabled:bg-gray-50 disabled:cursor-not-allowed;
  }

  /* Chat Messages */
  .message {
    @apply px-4 py-3 rounded-lg max-w-xs break-words 
           animate-in fade-in slide-in-from-bottom-2 duration-300;
  }

  .message-user {
    @apply bg-chat-user text-gray-900 ml-auto rounded-br-none;
  }

  .message-bot {
    @apply bg-chat-bot text-gray-900 rounded-bl-none;
  }

  .message-error {
    @apply bg-chat-error text-red-900 rounded-none;
  }

  .message-system {
    @apply bg-gray-200 text-gray-900 text-xs italic rounded-none;
  }

  /* Chat Window */
  .chat-window {
    @apply w-full h-full bg-white rounded-2xl shadow-2xl 
           flex flex-col overflow-hidden;
  }

  .chat-header {
    @apply bg-gradient-to-r from-brand-600 to-brand-700 
           text-white px-6 py-4 flex justify-between items-center 
           flex-shrink-0;
  }

  .chat-messages {
    @apply flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50;
  }

  .chat-footer {
    @apply border-t border-gray-200 p-4 flex-shrink-0 bg-gray-50;
  }

  /* Floating Button */
  .chat-float-btn {
    @apply fixed bottom-6 right-6 z-50 w-16 h-16 
           rounded-full bg-gradient-to-br from-brand-600 to-brand-700
           hover:from-brand-700 hover:to-brand-800
           text-white shadow-xl flex items-center justify-center
           text-2xl transition-all duration-200 hover:scale-110
           active:scale-95 cursor-pointer border-none;
  }

  /* Loading indicator */
  .chat-loading {
    @apply inline-block animate-spin;
  }
}

/* Utilidades adicionales */
@layer utilities {
  /* Accesibilidad */
  .sr-only {
    @apply absolute w-1 h-1 p-0 m-negative-1 overflow-hidden 
           clip whitespace-nowrap border-0;
  }

  /* Focus visible (para accesibilidad) */
  .focus-visible {
    @apply outline-none ring-2 ring-brand-600 ring-offset-2;
  }
}
```

---

### Tipos TypeScript

### src/types/chat.ts

```typescript
/**
 * Tipos para el sistema de chat
 * Utilizados en toda la aplicación para type safety
 */

export type SenderType = 'user' | 'bot' | 'agent';
export type MessageType = 'text' | 'error' | 'system' | 'action';
export type ChannelType = 'web' | 'whatsapp' | 'mercadolibre';

export interface Message {
  id: string;
  content: string;
  sender: SenderType;
  timestamp: Date;
  type: MessageType;
  metadata?: {
    intent?: string;
    confidence?: number;
    orderId?: string;
    productId?: string;
  };
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isOpen: boolean;
  userId: string;
  conversationId: string;
  error: string | null;
}

export interface BotResponse {
  message: string;
  confidence?: number;
  intent?: string;
  requiresEscalation?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChatPayload {
  text: string;
  userId: string;
  channel: ChannelType;
  timestamp: string;
  conversationId: string;
}

export interface APIErrorResponse {
  error: string;
  status: number;
  details?: Record<string, unknown>;
}
```

---

### Fetch API (sin Axios) - Arquitectura Modular DRY

La arquitectura de servicios sigue el principio **DRY** (Don't Repeat Yourself) con separación clara de responsabilidades.

#### Estructura de `src/services/`

```
services/
├── index.ts          # Main exports
├── config.ts         # API configuration
├── endpoints.ts      # All endpoint URLs
├── types.ts          # All service types
├── http.ts           # Base HTTP client
├── health.ts
├── chat/
│   ├── index.ts
│   ├── sendMessage.ts
│   └── getConversation.ts
├── products/
│   └── searchProducts.ts
├── orders/
│   └── getOrderStatus.ts
├── users/
│   └── getUserContext.ts
└── support/
    └── createTicket.ts
```

#### src/services/config.ts

```typescript
export const apiConfig = {
  baseUrl: import.meta.env.VITE_BUSINESS_API_URL || 'http://localhost:3000',
  timeout: 15000,
  rateLimit: 500,
  headers: { 'Content-Type': 'application/json' },
} as const;
```

#### src/services/endpoints.ts

```typescript
export const ENDPOINTS = {
  CHAT: {
    MESSAGES: '/api/messages',
    CONVERSATION: (id: string) => `/api/conversations/${id}`,
  },
  PRODUCTS: { SEARCH: '/api/products/search' },
  ORDERS: { GET: (id: string) => `/api/orders/${id}` },
  USERS: { CONTEXT: (id: string) => `/api/users/${id}/context` },
  SUPPORT: { TICKETS: '/api/tickets' },
  HEALTH: '/health',
} as const;
```

#### src/services/http.ts (Base HTTP Client)

```typescript
import { apiConfig } from './config';

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function httpClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${apiConfig.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    headers: { ...apiConfig.headers, ...options.headers },
    ...options,
  });

  if (!response.ok) {
    throw new APIError(response.status, `API Error: ${response.statusText}`);
  }
  return response.json() as T;
}
```

#### src/services/chat/sendMessage.ts (Single Responsibility)

```typescript
import { httpClient } from '../http';
import { ENDPOINTS } from '../endpoints';
import type { SendMessagePayload, BotResponse } from '../types';

export async function sendMessage(
  payload: SendMessagePayload
): Promise<BotResponse> {
  return httpClient<BotResponse>(ENDPOINTS.CHAT.MESSAGES, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

#### Uso en Hooks (Orchestration Only)

```typescript
// hooks/useChat.ts - HTTP only, no Socket.io
import { sendMessage as sendMessageHttp } from '../services';

export function useChat() {
  const sendMessage = useCallback(async (text: string) => {
    setLoading(true);
    try {
      const response = await sendMessageHttp({ text, userId, conversationId });
      addMessage({ content: response.message, sender: 'bot', ... });
    } catch (error) {
      addErrorMessage('Error sending message');
    } finally {
      setLoading(false);
    }
  }, []);
  return { sendMessage };
}
```

**Principios aplicados:**

- **DRY**: Config, endpoints, types centralizados
- **Single Responsibility**: Un archivo por acción
- **Separation of Concerns**: Hooks orquestan, services ejecutan
- **No Magic Strings**: Todo en constants/endpoints

---

### Zustand store (estado)

### src/hooks/useChatStore.ts

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Message, ChatState } from '@types/chat';

interface ChatStore extends ChatState {
  // Acciones
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  toggleOpen: () => void;
  setUserId: (id: string) => void;
  setError: (error: string | null) => void;
  addErrorMessage: (content: string) => void;
}

/**
 * Zustand store para estado global del chat
 * Alternativa a Redux (mucho más simple y TypeScript-friendly)
 *
 * VENTAJAS vs Redux:
 * ✅ Boilerplate mínimo
 * ✅ TypeScript nativo
 * ✅ Persiste automático
 * ✅ Devtools integrado
 * ✅ Zero dependencies (solo 1KB)
 */
export const useChatStore = create<ChatStore>()(
  devtools(
    persist(
      (set) => ({
        messages: [],
        isLoading: false,
        isOpen: false,
        userId: localStorage.getItem('userId') || `user_${Date.now()}`,
        conversationId: `conv_${Date.now()}`,
        error: null,

        addMessage: (message) =>
          set((state) => ({
            messages: [...state.messages, message],
          })),

        clearMessages: () => set({ messages: [] }),

        setLoading: (loading) => set({ isLoading: loading }),

        toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

        setUserId: (id) => {
          localStorage.setItem('userId', id);
          set({ userId: id });
        },

        setError: (error) => set({ error }),

        addErrorMessage: (content) =>
          set((state) => ({
            messages: [
              ...state.messages,
              {
                id: Date.now().toString(),
                content,
                sender: 'bot',
                timestamp: new Date(),
                type: 'error',
              } as Message,
            ],
          })),
      }),
      {
        name: 'chatbot-store', // LocalStorage key
        partialize: (state) => ({
          userId: state.userId,
          conversationId: state.conversationId,
        }), // Solo persistir userId y conversationId
      }
    ),
    { name: 'ChatStore' }
  )
);
```

---

### Componente principal — ChatWindow.tsx

```typescript
import React, { useRef, useEffect } from 'react';
import { useChatStore } from '@hooks/useChatStore';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

/**
 * Componente principal del chat
 * - Responsive (móvil y desktop)
 * - Accesible (ARIA labels, keyboard navigation)
 * - Tailwind v4 (utility-first)
 */
export default function ChatWindow() {
  const { isOpen, toggleOpen, messages } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll cuando hay nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <>
      {/* Botón flotante cuando está cerrado */}
      <div
        className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
          isOpen ? 'w-96 h-[600px]' : 'w-16 h-16'
        }`}
      >
        {!isOpen && (
          <button
            onClick={toggleOpen}
            className="w-full h-full rounded-full bg-gradient-to-br from-brand-600 to-brand-700
                       hover:from-brand-700 hover:to-brand-800
                       text-white shadow-xl flex items-center justify-center
                       text-2xl transition-all duration-200 hover:scale-110
                       active:scale-95"
            aria-label="Abrir chat de soporte"
            title="Abre el chat para hablar con nosotros"
          >
            💬
          </button>
        )}

        {/* Ventana de chat */}
        {isOpen && (
          <div className="w-full h-full bg-white rounded-2xl shadow-2xl
                          flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-600 to-brand-700
                            text-white px-6 py-4 flex justify-between items-center
                            flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold">Chat Soporte 24/7</h3>
                <p className="text-xs text-brand-100">Respuestas instantáneas</p>
              </div>
              <button
                onClick={toggleOpen}
                className="text-2xl hover:bg-brand-700/30 rounded-full
                           w-8 h-8 flex items-center justify-center
                           transition-colors"
                aria-label="Cerrar chat"
              >
                ×
              </button>
            </div>

            {/* Mensajes */}
            <MessageList />
            <div ref={messagesEndRef} className="h-px" />

            {/* Input */}
            <MessageInput />
          </div>
        )}
      </div>

      {/* Overlay para móvil (cuando chat está abierto) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-40"
          onClick={toggleOpen}
          aria-hidden="true"
        />
      )}
    </>
  );
}
```

---

### Componente input — MessageInput.tsx

```typescript
import React, { useState } from 'react';
import { useChatStore } from '@hooks/useChatStore';
import { useChat } from '@hooks/useChat';

export default function MessageInput() {
  const [input, setInput] = useState('');
  const { isLoading, setLoading } = useChatStore();
  const { sendMessage } = useChat();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setLoading(true);
    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-gray-200 p-4 flex-shrink-0 bg-gray-50"
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={isLoading}
          className="chat-input"
          autoFocus
          autoComplete="off"
          spellCheck="true"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="chat-btn"
          aria-label="Enviar mensaje"
        >
          {isLoading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            '→'
          )}
        </button>
      </div>
    </form>
  );
}
```

---

### Hook principal — useChat.ts

> **A. Transacciones con Socket.io (ack + fallback)**
>
> Para mantener consistencia “end-to-end” (estilo saga) en tiempo real:
>
> - Emitís por WebSocket y esperás **ack** del server (`response.ok`).
> - Si no hay ack o `ok=false`, hacés **fallback a HTTP** (misma lógica, mismo payload).
>
> ✅ Ejemplo (ya aplicado en `useChat.ts`):
>
> ```ts
> socket.emit('user_message', payload, (response) => {
>   if (!response?.ok) {
>     // Fallback a HTTP
>     chatService.sendMessage(payload);
>   }
> });
> ```

> **D. Rate limiting (frontend)**
>
> Para evitar spam/doble-click y proteger costos (tokens), agregá un “cooldown” mínimo en el widget:
>
> ```ts
> const [lastMessageTime, setLastMessageTime] = useState(0);
>
> const sendMessage = (text: string) => {
>   if (Date.now() - lastMessageTime < 500) return; // 500ms mínimo
>   setLastMessageTime(Date.now());
>   // ... send
> };
> ```

```typescript
import { useEffect } from 'react';
import { useChatStore } from './useChatStore';
import { chatService } from '@services/api';
import { Message, ChatPayload } from '@types/chat';
import io from 'socket.io-client';

const API_URL =
  import.meta.env.VITE_BUSINESS_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000';
const socket = io(API_URL);

/**
 * Hook personalizado para lógica del chat
 * Maneja:
 * - WebSocket connection (Socket.io)
 * - HTTP fallback con Fetch
 * - Estado sincronizado con Zustand
 * - TypeScript type-safe
 */
export function useChat() {
  const { addMessage, setLoading, userId, conversationId, addErrorMessage } =
    useChatStore();

  // Setup socket listeners
  useEffect(() => {
    const handleBotResponse = (data: { message: string }) => {
      const message: Message = {
        id: Date.now().toString(),
        content: data.message,
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      };
      addMessage(message);
      setLoading(false);
    };

    socket.on('bot_response', handleBotResponse);
    socket.on('error', (error) => {
      addErrorMessage(
        error.message || 'Error en la conexión. Por favor intenta de nuevo.'
      );
      setLoading(false);
    });

    return () => {
      socket.off('bot_response', handleBotResponse);
      socket.off('error');
    };
  }, [addMessage, setLoading, addErrorMessage]);

  const sendMessage = async (text: string) => {
    // 1. Agregar mensaje del usuario inmediatamente (optimistic update)
    const userMessage: Message = {
      id: Date.now().toString(),
      content: text,
      sender: 'user',
      timestamp: new Date(),
      type: 'text',
    };
    addMessage(userMessage);
    setLoading(true);

    try {
      // 2. Emitir por WebSocket (rápido)
      const payload: Omit<ChatPayload, 'timestamp'> & { timestamp?: string } = {
        text,
        userId,
        conversationId,
        channel: 'web' as const,
        timestamp: new Date().toISOString(),
      };

      socket.emit('user_message', payload, (response: { ok: boolean }) => {
        if (!response?.ok) {
          // Fallback a HTTP si WebSocket falla
          chatService.sendMessage(payload as ChatPayload).catch((error) => {
            console.error('Fallback HTTP error:', error);
            addErrorMessage(
              'No pudimos procesar tu mensaje. Por favor intenta de nuevo.'
            );
            setLoading(false);
          });
        }
      });
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: 'Error: No pudimos procesar tu mensaje.',
        sender: 'bot',
        timestamp: new Date(),
        type: 'error',
      };
      addMessage(errorMessage);
      setLoading(false);
    }
  };

  return { sendMessage };
}
```

---

### Componentes secundarios

### MessageList.tsx

```typescript
import React from 'react';
import { useChatStore } from '@hooks/useChatStore';
import Message from './Message';

export default function MessageList() {
  const { messages } = useChatStore();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
      {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          <p className="text-sm">👋 ¡Hola! Soy un asistente virtual</p>
          <p className="text-xs text-gray-400">¿Cómo puedo ayudarte?</p>
        </div>
      )}

      {messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### Message.tsx

```typescript
import React from 'react';
import { Message as MessageType } from '@types/chat';

interface Props {
  message: MessageType;
}

export default function Message({ message }: Props) {
  const baseClasses = 'message';
  const typeClasses = {
    user: 'message-user',
    bot: 'message-bot',
    agent: 'message-bot',
    error: 'bg-chat-error text-red-900',
    system: 'bg-gray-200 text-gray-900 text-xs italic',
  };

  return (
    <div className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`${baseClasses} ${typeClasses[message.type]}`}>
        <p className="text-sm">{message.content}</p>
        <span className="text-xs text-gray-500 mt-1 block">
          {message.timestamp.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
```

---

### Build y deploy

```bash
# Development
npm run dev

# Build production (TypeScript compilado automáticamente + Tailwind optimizado)
npm run build

# Preview de build
npm run preview

# Output: dist/
# - index.html
# - assets/index-XXXXX.js (TypeScript compilado)
# - assets/index-XXXXX.css (Tailwind v4 optimizado)

# Tamaño final esperado:
# - JS: ~150KB (React 19 + Zustand)
# - CSS: ~25KB (Tailwind v4 con purge automático)
# Total: ~175KB gzipped

# Deploy en tu web (e-commerce propio):
# 1. Hospedar dist/ en CDN o servidor
# 2. Insertar en tu web (template/layout) o tag manager
# <script src="https://tu-dominio.com/chatbot/index.js" defer></script>
```

---

## SEMANA 3: BACKEND API DE NEGOCIO (E-commerce propio)

### Objetivo

Reemplazar integraciones específicas (terceros) por una **API de negocio propia** que el chatbot consume vía HTTP.
Esto mantiene Clean Code: el widget no conoce “la tienda”, solo conoce **endpoints**.

### Endpoints mínimos (MVP)

- `POST /chat/messages` → recibe mensaje del usuario y devuelve respuesta del bot
- `GET /orders/:id` → estado del pedido (validando `email/phone`)
- `GET /products?search=...` → búsqueda simple
- `POST /tickets` → handoff humano (opcional)
- `GET /health` → healthcheck

### Contratos (schemas) recomendados

```json
// Chat request
{
  "text": "string",
  "userId": "string",
  "conversationId": "string",
  "channel": "web|whatsapp|mercadolibre",
  "timestamp": "ISO-8601"
}
```

```json
// Chat response
{
  "ok": true,
  "message": "string",
  "conversationId": "string",
  "meta": {
    "intent": "faq|order_status|product_search|handoff",
    "confidence": 0.0
  }
}
```

### Seguridad (mínimo)

- Autenticación por **API key** o **HMAC signature** para canales server-to-server.
- Rate limiting server-side (por IP + userId).
- Logs estructurados + trazas por `conversationId`.

### Storage (mínimo)

- Postgres: `users`, `conversations`, `messages`, `external_events`, `outbox_messages`
- Idempotencia para webhooks: `external_events` con UNIQUE.

### Nota de implementación

Podés implementarlo en:

- **Node.js/Express/Fastify** (rápido)
- **Rails** (si ya está en tu stack)
- **Go** (si querés performance y binario único)

## SEMANA 3-4: WHATSAPP INTEGRATION

### Setup Webhook en Meta

```
Facebook App Dashboard:
WhatsApp > Configuration

Webhook URL: https://tu-dominio.com/webhooks/whatsapp
Verify Token: "abc123secure" (tu elección)
Subscribe: messages, message_status
```

### Workflow n8n: WhatsApp Webhook

```
Trigger: Webhook POST from WhatsApp

├─ Extract: phone, message, timestamp
├─ Validate: Verify signature
├─ Lookup: User en BD por teléfono
├─ Get context: últimos 5 mensajes
├─ Process: LLM (igual flujo main)
├─ Save: INSERT en messages
└─ Send back: WhatsApp Cloud API
   POST https://graph.instagram.com/v18.0/{{PHONE_ID}}/messages
   {
     "messaging_product": "whatsapp",
     "to": "{{phone}}",
     "type": "text",
     "text": {
       "body": "{{bot_response}}"
     }
   }
```

### Message Templates (Pre-approval)

```
1. Notificación de orden:
   "Hola {{1}}, tu orden {{2}} ha sido {{3}}.
    Tracking: {{4}}"

2. Recomendación:
   "Hi {{1}}, encontramos {{2}} que te podría gustar:
    {{3}} - {{4}}"

3. Recordatorio:
   "{{1}}, tu carrito tiene {{2}} libros.
    ¿Quieres completar la compra?"
```

---

## SEMANA 4: MERCADO LIBRE INTEGRATION

### Obtener Credenciales ML

```
https://developers.mercadolibre.com.ar/panel

App Credentials:
├─ Client ID: xxxxxxx
├─ Client Secret: xxxxxxx
├─ Redirect URI: https://tu-dominio.com/ml/callback
└─ Scope:
  - read
  - write
  - offline_access
```

### Workflow: Preguntas de Mercado Libre

```
Trigger: Webhook POST from ML (new question)

├─ Extract: question_id, item_id, seller_id
├─ Get: Product details from ML API
├─ Get: Previous questions (context)
├─ OpenAI: Generate response
│  System: "Eres vendedor en Mercado Libre. Responde en español."
│  Context: Product details + previous Q&A
├─ Save: Response en BD
└─ POST ML API: /messages/{{item_id}}/questions/{{question_id}}/reply
   {
     "text": "{{bot_response}}"
   }
```

### Sincronización de Órdenes

```
Trigger: Cron cada 15 minutos

├─ GET /orders from ML API
│  Query params: seller_id, status=all
├─ For each order:
│  ├─ Check if exists in our DB
│  ├─ Compare status with last sync
│  └─ If changed: send notification
├─ Update: last_sync timestamp
└─ Send WhatsApp to customer (if applicable)
   "Tu orden en ML cambió a {{status}}"
```

---

## SEMANA 4-5: TESTING & DEPLOYMENT

### Testing Checklist

```
[ ] Web Chat
  [ ] Enviar texto
  [ ] Recibir respuesta
  [ ] Historial persiste
  [ ] Mobile responsive
  [ ] Cerrar/reabrir mantiene contexto

[ ] Backend API Integration
  [ ] Search product → aparece en respuesta
  [ ] Get order status
  [ ] Verficación de stock

[ ] WhatsApp
  [ ] Enviar mensaje WhatsApp
  [ ] Bot responde automático
  [ ] Template messages funcionan

[ ] Mercado Libre
  [ ] Pregunta en ML → respuesta automática
  [ ] Órdenes se sincronizan

[ ] Error Handling
  [ ] API down → graceful fallback
  [ ] Mal formatted message → error handling
  [ ] OpenAI fail → fallback to FAQ
```

### Monitoreo en Producción

```bash
# ✅ Docker-first monitoring (recomendado si todo corre en containers)

# Ver recursos (CPU/RAM/IO) por container
docker stats

# Ver logs (tail + follow)
docker compose logs -f --tail=100 n8n
docker compose logs -f --tail=100 postgres

# Estado de containers
docker compose ps

# Healthcheck rápido (si expusiste n8n en localhost)
curl -f http://127.0.0.1:5678/ || echo "n8n not reachable"

# (Opcional) Si corrés un backend Node fuera de Docker, ahí sí PM2:
# npm install -g pm2
# pm2 start app.js --name "chatbot"
# pm2 logs chatbot

# Health check (cron cada 5 min) - ajustá URL
# */5 * * * * curl -f https://tu-dominio.com/health || send_alert

```

### SSL & Nginx (producción)

> Recomendado: usar Nginx como reverse proxy (HTTPS + rate limiting) delante de la Backend API y n8n.

```nginx
# HTTP → HTTPS Redirect
server {
    listen 80;
    server_name api.tu-dominio.com;
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS (Producción)
server {
    listen 443 ssl http2;
    server_name api.tu-dominio.com;

    # SSL Certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tu-dominio.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/api.tu-dominio.com/chain.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5:!3DES;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security Headers (HSTS, CSP, etc.)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # Hide nginx version
    server_tokens off;

    # Rate Limiting Zones
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    # Logging
    access_log /var/log/nginx/chatbot_access.log combined;
    error_log /var/log/nginx/chatbot_error.log warn;

    # API Backend
    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # n8n Endpoint
    location /n8n/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://localhost:5678/;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    # Webhooks (más permisivo)
    location /webhooks/ {
        limit_req zone=api burst=100 nodelay;
        proxy_pass http://localhost:5678/;
        client_max_body_size 50M;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Denegar acceso a archivos sensibles
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ ~$ {
        deny all;
    }

    # Health check endpoint (simplista)
    location /health {
        access_log off;
        return 200 "healthy
";
        add_header Content-Type text/plain;
    }
}
```

#### Instalar Nginx + Let's Encrypt (Certbot)

```bash
# 1. Instalar Nginx
apt-get install -y nginx certbot python3-certbot-nginx

# 2. Habilitar y iniciar
systemctl enable nginx
systemctl start nginx

# 3. Generar certificado SSL
certbot certonly --standalone -d api.tu-dominio.com
# Responder preguntas (email, términos, etc)

# 4. Auto-renew
systemctl enable certbot.timer
systemctl start certbot.timer

# 5. Copiar config
cp /etc/nginx/sites-available/chatbot /etc/nginx/sites-enabled/chatbot
rm /etc/nginx/sites-enabled/default

# 6. Test config
nginx -t

# 7. Reload
systemctl reload nginx

# 8. Verificar
curl -I https://api.tu-dominio.com
```

---

## QUICK COMMANDS REFERENCE

```bash
# View logs
docker compose logs -f n8n
docker compose logs -f postgres

# Backup database (Postgres NO expuesto)
docker exec -t chatbot_db pg_dump -U chatbot_user -d chatbot > backup_$(date +%Y%m%d).sql

# Restore database
cat backup.sql | docker exec -i chatbot_db psql -U chatbot_user -d chatbot

# Check n8n running (via localhost)
curl -f http://127.0.0.1:5678/ || echo "n8n not reachable on localhost"

# Test OpenAI (requiere OPENAI_API_KEY exportado)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# SSH into VPS
ssh deploy@your-ip

# Update code in production (si versionas /opt/chatbot)
cd /opt/chatbot && git pull origin main && docker compose up -d

# Monitor resource usage
docker stats

# Restart everything
docker compose down && docker compose up -d
```

---

## TROUBLESHOOTING

### n8n no inicia

```
→ Check logs: docker compose logs n8n
→ Verify: PostgreSQL está running
→ Reintentar: docker compose restart
```

### OpenAI error

```
→ Verificar API key en .env
→ Check balance en https://platform.openai.com/account/billing/overview
→ Si says "invalid_request_error": review el system prompt syntax
```

### WhatsApp webhook no recibe mensajes

```
→ Verificar: URL correcta en Meta app
→ Verificar: Verify token coincide
→ Revisar: n8n logs para errores
→ Probar: Enviar message desde phone, revisar logs
```

### PostgreSQL full disk

```
→ Backup y limpiar logs: vacuumdb
→ Revisar: tamaño de table messages
→ Purgar: mensajes >90 días
```

---

**Good luck building! 🚀**

Preguntas? Review la guía completa en: guia-chatbot-ecommerce-in-house.md

---

## COMPARACIÓN: Stack Original vs Stack Actualizado 2026

| Aspecto       | Original             | Actualizado 2026     | Mejora                  |
| ------------- | -------------------- | -------------------- | ----------------------- |
| HTTP Client   | Axios                | Fetch API            | -40KB bundle, nativa    |
| UI Framework  | CSS custom           | Tailwind v4          | Más consistente, rápido |
| Lenguaje      | JavaScript           | TypeScript           | Mejor DX, menos bugs    |
| Estado        | Zustand              | Zustand mejorado     | Persiste + Devtools     |
| Versión React | 18                   | 19                   | Mejor performance       |
| Data Fetching | useEffect + setState | TanStack Query ready | Más fácil escalar       |

---

## COMANDO RÁPIDOS ACTUALIZADO

```bash
# Crear componente TypeScript
npx create-react-component --typescript src/components/MyComponent

# Type checking
npm run type-check  # o: tsc --noEmit

# Linting
npm install -D eslint @eslint/js typescript-eslint
npm run lint

# Testing (recomendado: Vitest)
npm install -D vitest @testing-library/react

# Monitoreo de bundle size
npm install -D bundlesize
npm run build && bundlesize

# Análisis de performance
npm install -D lighthouse-ci
npm run lighthouse
```

---

## PRÓXIMOS PASOS

1. ✅ Usar Fetch API nativa (sin Axios)
2. ✅ TypeScript en TODO el código
3. ✅ Tailwind v4 con nuevo sistema de imports
4. ✅ Zustand para estado simple y escalable
5. ⏭️ Integrar TanStack Query en Semana 3 para caching inteligente

---

**Stack 2026 = Más rápido, más simple, menos dependencias** 🚀

Preguntas? Review la guía completa: guia-chatbot-ecommerce-in-house.md

---

## 🎯 SETUP FINAL CHECKLIST - Completar Guía al 100%

### Documento de completación para developer_quick_ref.md

---

### 📦 1. ENVIRONMENT VARIABLES - .env y .env.example

#### Crear: `.env.example` (COMMIT A GIT)

```bash
## Frontend (elige según framework)

# Vite
VITE_BUSINESS_API_URL=http://localhost:3000
VITE_API_URL=http://localhost:3000

# Next.js
NEXT_PUBLIC_BUSINESS_API_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000

## Backend - Solo para referencia en VPS
## DATABASE_URL=postgresql://chatbot_user:password@localhost:5432/chatbot
## OPENAI_API_KEY=sk-...
## ML_CLIENT_ID=...
## ML_CLIENT_SECRET=...
## WHATSAPP_TOKEN=...
## N8N_USER=...
## N8N_PASSWORD=...
## N8N_ENCRYPTION_KEY=...
```

#### Crear: `.env` (NEVER COMMIT - .gitignore)

```bash
## Frontend
VITE_BUSINESS_API_URL=http://localhost:3000
VITE_API_URL=http://localhost:3000

## Backend (en /opt/chatbot/.env)
DB_PASSWORD=your_secure_password_here
N8N_USER=admin
N8N_PASSWORD=your_secure_password_here
DOMAIN=yourdomain.com
OPENAI_API_KEY=sk-your-actual-key
BUSINESS_API_URL=https://api.tu-dominio.com
BUSINESS_API_KEY=your_business_api_key
ML_CLIENT_ID=your_mercado_libre_id
ML_CLIENT_SECRET=your_mercado_libre_secret
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_ID=your_phone_id
WHATSAPP_VERIFY_TOKEN=abc123secure
```

#### Agregar a .gitignore

```
## Environment variables
.env
.env.local
.env.*.local

## Dependencies
node_modules/
/.pnp
.pnp.js

## Testing
/coverage

## Production
/build
/dist

## Misc
.DS_Store
*.pem
.vscode/
.idea/

## Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
```

---

### 📝 2. PACKAGE.JSON - Scripts y Dependencias

#### Actualizar: `package.json`

```json
{
  "name": "chatbot-widget",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "description": "E-commerce Chatbot Widget - React 19 + TypeScript + Tailwind v4",
  "author": "Tu nombre",
  "license": "MIT",
  "homepage": "https://github.com/tu-repo/chatbot-widget",
  "repository": {
    "type": "git",
    "url": "https://github.com/tu-repo/chatbot-widget"
  },
  "bugs": {
    "url": "https://github.com/tu-repo/chatbot-widget/issues"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx --max-warnings 10",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "bundle-report": "vite build --mode analyze"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^4.8.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.10",
    "@testing-library/jest-dom": "^6.1.5",
    "@testing-library/react": "^14.1.2",
    "@types/node": "^20.10.5",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "postcss": "^8.4.32",
    "prettier": "^3.1.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.8",
    "vitest": "^1.1.0",
    "@vitest/ui": "^1.1.0",
    "@vitest/coverage-v8": "^1.1.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

---

### 🔍 3. LINTING & FORMATTING - ESLint + Prettier

#### Crear: `.eslintrc.json`

```json
{
  "env": {
    "browser": true,
    "es2024": true
  },
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "ignorePatterns": ["dist", ".eslintrc.cjs", "node_modules"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": [
      "warn",
      {
        "allow": ["warn", "error"]
      }
    ],
    "quotes": ["error", "single"],
    "semi": ["error", "always"]
  }
}
```

#### Crear: `.prettierrc.json`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

#### Crear: `.prettierignore`

```
node_modules
dist
.next
build
```

---

### 🧪 4. TESTING SETUP - Vitest + Testing Library

#### Crear: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
```

#### Crear: `src/test/setup.ts`

```typescript
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Cleanup después de cada test
afterEach(() => {
  cleanup();
});
```

#### Crear ejemplo: `src/components/__tests__/Message.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Message from '../Message';
import { Message as MessageType } from '@types/chat';

describe('Message Component', () => {
  const mockMessage: MessageType = {
    id: '1',
    content: 'Hola',
    sender: 'user',
    timestamp: new Date(),
    type: 'text',
  };

  it('renders message content', () => {
    render(<Message message={mockMessage} />);
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });

  it('displays user message on the right', () => {
    const { container } = render(<Message message={mockMessage} />);
    const messageDiv = container.querySelector('.message-user');
    expect(messageDiv).toBeTruthy();
  });
});
```

---

### 💾 5. DATABASE SCHEMA - PostgreSQL

#### Crear: `sql/01_initial_schema.sql`

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  channel VARCHAR(50) NOT NULL DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,
  conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  sender VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'text',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Create products cache table (Business API)
CREATE TABLE IF NOT EXISTS products_cache (
  id SERIAL PRIMARY KEY,
  product_external_id INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2),
  image_url TEXT,
  url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table (Business API)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_external_id INTEGER NOT NULL UNIQUE,
  user_id VARCHAR(255) REFERENCES users(id),
  status VARCHAR(50) NOT NULL,
  total DECIMAL(10, 2),
  tracking_number VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_products_cache_updated ON products_cache(updated_at);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

#### Run scripts

```bash
## Ejecutar desde VPS
cat sql/01_initial_schema.sql | docker exec -i chatbot_db psql -U chatbot_user -d chatbot

## Verificar tablas
docker exec -it chatbot_db psql -U chatbot_user -d chatbot -c "\dt"
```

---

### 🔌 6. API ENDPOINTS REFERENCE

#### Documento: `API_ENDPOINTS.md`

````markdown
## API Endpoints Reference

### Chat Service

#### POST /api/messages

Send a chat message

**Request:**

```json
{
  "text": "string",
  "userId": "string",
  "conversationId": "string",
  "channel": "web|whatsapp|mercadolibre",
  "timestamp": "2026-01-27T20:10:00Z"
}
```
````

**Response:**

```json
{
  "message": "string",
  "confidence": 0.95,
  "intent": "product_search|order_status|faq"
}
```

---

#### GET /api/conversations/:conversationId

Get conversation history

**Response:**

```json
{
  "id": "string",
  "userId": "string",
  "messages": [
    {
      "id": "string",
      "content": "string",
      "sender": "user|bot",
      "timestamp": "ISO8601"
    }
  ]
}
```

---

#### GET /api/users/:userId/context

Get user context

**Response:**

```json
{
  "userId": "string",
  "email": "string",
  "phone": "string",
  "lastOrder": {
    /* order object */
  },
  "preferences": {}
}
```

---

#### GET /api/products/search?q=keyword

Search products (Business API)

**Response:**

```json
[
  {
    "id": "string",
    "name": "string",
    "price": "string",
    "image": "string",
    "url": "string"
  }
]
```

---

#### GET /api/orders/:orderId

Get order status (Business API)

**Response:**

```json
{
  "id": "string",
  "status": "pending|processing|completed",
  "total": "number",
  "tracking": "string"
}
```

---

### HTTP API Endpoints

#### POST /api/messages

Send a message to the chatbot:

**Request:**

```typescript
const response = await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'string',
    userId: 'string',
    conversationId: 'string',
  }),
});
```

**Response:**

```typescript
const data: BotResponse = await response.json();
// { message: string, confidence?: number, intent?: string }
```

---

### Error Responses

All endpoints return error responses:

```json
{
  "error": "Error message",
  "status": 400,
  "details": {}
}
```

**Status Codes:**

- 200: Success
- 400: Bad request
- 401: Unauthorized
- 404: Not found
- 500: Server error
- 503: Service unavailable

````

---

### 🛡️ 7. ERROR BOUNDARIES - React Error Handling

#### Crear: `src/components/ErrorBoundary.tsx`

```typescript
import React, { ReactNode, ReactElement } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactElement;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Aquí puedes enviar el error a un servicio de monitoreo
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h2 className="text-red-800 font-semibold">Algo salió mal</h2>
            <p className="text-red-700 text-sm mt-2">
              Por favor, intenta recargar la página
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Recargar
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
````

#### Usar en `src/App.tsx`

```typescript
import { ErrorBoundary } from '@components/ErrorBoundary';
import ChatWindow from '@components/ChatWindow';

export default function App() {
  return (
    <ErrorBoundary>
      <ChatWindow />
    </ErrorBoundary>
  );
}
```

---

### ⚙️ 8. VITE CONFIG - vite.config.ts

#### Crear: `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // true en desarrollo
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          state: ['zustand'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
});
```

---

### 🔐 9. SECURITY CHECKLIST

```markdown
## Security Checklist

### Frontend Security

- [ ] No guardar tokens en localStorage (usar httpOnly cookies)
- [ ] Validar inputs en cliente y servidor
- [ ] Sanitizar HTML user-generated (usar DOMPurify)
- [ ] HTTPS en producción (SSL certificate)
- [ ] CSP headers configurados
- [ ] CORS bien configurado (solo dominios permitidos)
- [ ] Rate limiting en cliente
- [ ] No mostrar errores sensibles al usuario

### Backend Security

- [ ] Variables de entorno nunca en .env.example con valores reales
- [ ] API keys rotadas regularmente
- [ ] Validación de entrada (zod o similar)
- [ ] Rate limiting en endpoints
- [ ] Autenticación en todos los endpoints privados
- [ ] HTTPS obligatorio en producción
- [ ] CORS whitelist específico
- [ ] SQL injection prevention (prepared statements)
- [ ] XSS prevention (output escaping)
- [ ] CSRF tokens si es necesario
- [ ] Headers de seguridad (Helmet.js o similar)
- [ ] Logging de errores sin exponer detalles
- [ ] Regular dependency updates

### Database Security

- [ ] Contraseña fuerte para PostgreSQL
- [ ] Backups regulares
- [ ] Encripción de datos sensibles
- [ ] Row-level security (RLS) si es aplicable
- [ ] No exponer estructura de DB

### API Security

- [ ] Validate all inputs
- [ ] Use rate limiting (express-rate-limit)
- [ ] Use HTTPS
- [ ] Implement CORS properly
- [ ] Add security headers
- [ ] Monitor for suspicious activity
```

---

### 📊 10. ESTRUCTURA DE CARPETAS RECOMENDADA

```
chatbot-widget/
├── src/
│   ├── components/
│   │   ├── __tests__/
│   │   │   └── Message.test.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── MessageInput.tsx
│   │   ├── MessageList.tsx
│   │   ├── Message.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/
│   │   ├── useChat.ts
│   │   └── useChatStore.ts
│   ├── services/              # ALL API calls (DRY)
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── endpoints.ts
│   │   ├── types.ts
│   │   ├── http.ts
│   │   ├── chat/
│   │   ├── products/
│   │   ├── orders/
│   │   ├── users/
│   │   └── support/
│   ├── lib/
│   │   ├── constants/
│   │   └── utils/
│   ├── types/
│   │   └── chat.ts
│   ├── utils/
│   │   └── logger.ts
│   ├── test/
│   │   └── setup.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
├── sql/
│   └── 01_initial_schema.sql
├── .env.example
├── .env (NEVER COMMIT)
├── .gitignore
├── .eslintrc.json
├── .prettierrc.json
├── eslint.config.js
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── package-lock.json
├── README.md
├── API_ENDPOINTS.md
└── SECURITY.md
```

---

### 🚀 11. QUICK START - 5 MINUTOS

```bash
## 1. Clonar/crear proyecto
git clone <repo>
cd chatbot-widget

## 2. Copiar environment
cp .env.example .env
## Editar .env con valores reales

## 3. Instalar dependencias
npm install

## 4. Verificar TypeScript
npm run type-check

## 5. Ejecutar desarrollo
npm run dev

## 6. Otros comandos útiles
npm run lint       # Verificar código
npm run format     # Formatear código
npm run test       # Ejecutar tests
npm run build      # Build para producción
```

---

### 📝 12. DEPLOYMENT CHECKLIST

```markdown
## Pre-Deployment Checklist

### Code Quality

- [ ] npm run type-check - No errors
- [ ] npm run lint - No errors
- [ ] npm run test - All tests pass
- [ ] npm run build - Build succeeds

### Security

- [ ] .env has real secure values
- [ ] .env is in .gitignore
- [ ] No console.log statements in production
- [ ] API keys are secure

### Performance

- [ ] Bundle size < 200KB
- [ ] No unused imports
- [ ] Lazy loading configured
- [ ] Images optimized

### Compatibility

- [ ] Tested on Chrome/Firefox/Safari
- [ ] Mobile responsive
- [ ] Works without JavaScript (graceful degradation)

### Documentation

- [ ] README.md updated
- [ ] API_ENDPOINTS.md updated
- [ ] SECURITY.md reviewed
- [ ] Code comments added

### Monitoring

- [ ] Error tracking setup (Sentry, etc)
- [ ] Analytics configured
- [ ] Logging configured
- [ ] Health checks in place
```

---

### 🎓 INTEGRACIÓN CON developer_quick_ref.md

Este documento complementa `developer_quick_ref.md` con:

1. ✅ .env configuration completa
2. ✅ package.json con todos los scripts
3. ✅ ESLint + Prettier setup
4. ✅ Vitest + Testing Library configuration
5. ✅ Database schema PostgreSQL
6. ✅ API endpoints reference
7. ✅ HTTP API endpoints documentation
8. ✅ Error Boundaries para React
9. ✅ Vite configuration
10. ✅ Security checklist
11. ✅ Carpetas recomendadas
12. ✅ Quick start guide
13. ✅ Pre-deployment checklist

---

### ✅ RESULTADO FINAL

Con este documento + `developer_quick_ref.md` tienes:

✅ **100% de cobertura técnica**
✅ **Setup listo para implementar**
✅ **Seguridad cubierta**
✅ **Testing incluido**
✅ **Documentación completa**
✅ **Deployment ready**

**Status: GUÍA COMPLETA Y LISTA PARA PRODUCCIÓN** 🚀

---

**Próximo paso: Empezar implementación mañana usando estos dos documentos.**

Preguntas sobre alguna sección específica?
