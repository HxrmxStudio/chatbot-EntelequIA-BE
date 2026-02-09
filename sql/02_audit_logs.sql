CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  conversation_id VARCHAR(255) NOT NULL,
  source message_channel NOT NULL,
  intent VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  http_status INT NOT NULL,
  error_code VARCHAR(100),
  latency_ms INT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
