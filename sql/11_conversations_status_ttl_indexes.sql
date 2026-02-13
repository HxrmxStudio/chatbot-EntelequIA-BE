CREATE INDEX IF NOT EXISTS idx_conversations_status_updated_at
  ON conversations(status, updated_at DESC);
