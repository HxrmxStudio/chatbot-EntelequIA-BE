-- ============================================
-- Chatbot EntelequIA - PostgreSQL Schema v3
-- Incluye: idempotencia + outbox + dedupe
-- ============================================

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1) TIPOS (ENUM) para consistencia
-- ============================================

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

-- ============================================
-- 2) FUNCIÓN para timestamps automáticos
-- ============================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3) TABLA: users
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 4) TABLA: conversations
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  channel message_channel NOT NULL DEFAULT 'web',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);

-- ============================================
-- 5) TABLA: messages
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  sender message_sender NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'text',
  channel message_channel,
  external_event_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);

-- Índice único para idempotencia (evitar duplicados por canal)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_channel_external
  ON messages(channel, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_external_event_id
  ON messages(external_event_id)
  WHERE external_event_id IS NOT NULL;

-- ============================================
-- 6) TABLA: external_events (idempotencia para webhooks)
-- ============================================

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

CREATE INDEX IF NOT EXISTS idx_external_events_status_created
  ON external_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_events_source_processed
  ON external_events(source, processed_at)
  WHERE processed_at IS NULL;

-- ============================================
-- 7) TABLA: outbox_messages (delivery guarantee + retries)
-- ============================================

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

-- Dedupe: evitar enviar el mismo mensaje 2 veces
CREATE UNIQUE INDEX IF NOT EXISTS uniq_outbox_dedupe
  ON outbox_messages(message_id, channel, to_ref)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_status_next_retry
  ON outbox_messages(status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_outbox_channel_to_ref
  ON outbox_messages(channel, to_ref);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
  ON outbox_messages(status, created_at);

-- ============================================
-- 8) TABLA: products_cache (opcional, para búsquedas rápidas)
-- ============================================

CREATE TABLE IF NOT EXISTS products_cache (
  id SERIAL PRIMARY KEY,
  product_external_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2),
  image_url TEXT,
  url TEXT,
  category VARCHAR(255),
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  CREATE TRIGGER trg_products_cache_updated_at
  BEFORE UPDATE ON products_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_cache_name ON products_cache USING gin(to_tsvector('spanish', name));
CREATE INDEX IF NOT EXISTS idx_products_cache_updated ON products_cache(updated_at);

-- ============================================
-- 9) TABLA: orders (opcional, para consultas de estado)
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_external_id VARCHAR(255) NOT NULL UNIQUE,
  user_id VARCHAR(255) REFERENCES users(id),
  status VARCHAR(50) NOT NULL,
  total DECIMAL(10, 2),
  tracking_number VARCHAR(255),
  shipping_status VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_external_id ON orders(order_external_id);

-- ============================================
-- QUERY DE EJEMPLO: Worker para outbox
-- ============================================
-- SELECT * FROM outbox_messages
-- WHERE status='pending'
--   AND (next_retry_at IS NULL OR next_retry_at <= now())
--   AND attempts < max_retries
-- ORDER BY created_at ASC
-- LIMIT 100;

-- ============================================
-- GDPR: Purga de datos antiguos (90 días)
-- ============================================
-- DELETE FROM messages WHERE created_at < now() - interval '90 days';
-- DELETE FROM external_events WHERE status = 'processed' AND created_at < now() - interval '90 days';
-- DELETE FROM outbox_messages WHERE status IN ('sent','failed','delivered') AND created_at < now() - interval '90 days';
