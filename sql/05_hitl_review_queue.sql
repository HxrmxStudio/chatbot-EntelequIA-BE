CREATE TABLE IF NOT EXISTS hitl_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  priority TEXT NOT NULL CHECK (
    priority IN ('high_confidence_error', 'random_sample', 'user_flagged', 'golden_sample')
  ),
  reviewed_by TEXT,
  quality_label TEXT CHECK (
    quality_label IN ('excellent', 'good', 'acceptable', 'poor', 'failed')
  ),
  issues TEXT[] NOT NULL DEFAULT '{}',
  corrected_response TEXT,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hitl_review_queue_pending
  ON hitl_review_queue(priority, sampled_at)
  WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hitl_review_queue_message_id
  ON hitl_review_queue(message_id);

