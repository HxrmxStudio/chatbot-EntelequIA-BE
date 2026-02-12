CREATE TABLE IF NOT EXISTS wf1_intent_exemplars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent TEXT NOT NULL,
  prompt_hint TEXT NOT NULL,
  confidence_weight NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
  source TEXT NOT NULL CHECK (source IN ('telemetry', 'feedback', 'manual')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wf1_intent_exemplars_intent_hint
  ON wf1_intent_exemplars(intent, prompt_hint);

CREATE INDEX IF NOT EXISTS idx_wf1_intent_exemplars_enabled_intent
  ON wf1_intent_exemplars(enabled, intent);

CREATE INDEX IF NOT EXISTS idx_wf1_intent_exemplars_updated
  ON wf1_intent_exemplars(updated_at DESC);

DO $$ BEGIN
  CREATE TRIGGER trg_wf1_intent_exemplars_updated_at
  BEFORE UPDATE ON wf1_intent_exemplars
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
