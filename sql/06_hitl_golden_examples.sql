CREATE TABLE IF NOT EXISTS hitl_golden_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  canonical_quality TEXT NOT NULL CHECK (
    canonical_quality IN ('excellent', 'good', 'acceptable', 'poor', 'failed')
  ),
  canonical_issues TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hitl_golden_message
  ON hitl_golden_examples(message_id)
  WHERE active = true;

