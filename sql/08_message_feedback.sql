CREATE TABLE IF NOT EXISTS message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id),
  source message_channel NOT NULL DEFAULT 'web',
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  reason VARCHAR(280),
  category TEXT CHECK (category IN ('accuracy', 'relevance', 'tone', 'ux', 'other')),
  external_event_id TEXT NOT NULL,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_message_feedback_source_external_event
  ON message_feedback(source, external_event_id);

CREATE INDEX IF NOT EXISTS idx_message_feedback_message_id
  ON message_feedback(message_id);

CREATE INDEX IF NOT EXISTS idx_message_feedback_conversation_created
  ON message_feedback(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_feedback_rating_created
  ON message_feedback(rating, created_at DESC);
