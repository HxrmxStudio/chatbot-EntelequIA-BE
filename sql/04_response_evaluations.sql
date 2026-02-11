CREATE TABLE IF NOT EXISTS response_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  request_id TEXT,
  intent TEXT,
  evaluator_model TEXT NOT NULL,
  relevance NUMERIC(4, 3) NOT NULL CHECK (relevance >= 0 AND relevance <= 1),
  completeness NUMERIC(4, 3) NOT NULL CHECK (completeness >= 0 AND completeness <= 1),
  context_adherence NUMERIC(4, 3) NOT NULL CHECK (context_adherence >= 0 AND context_adherence <= 1),
  role_adherence NUMERIC(4, 3) NOT NULL CHECK (role_adherence >= 0 AND role_adherence <= 1),
  hallucination_flag BOOLEAN NOT NULL DEFAULT false,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_hash TEXT NOT NULL,
  eval_date DATE NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE response_evaluations
  ADD COLUMN IF NOT EXISTS eval_date DATE;

ALTER TABLE response_evaluations
  ALTER COLUMN eval_date SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date);

UPDATE response_evaluations
SET eval_date = (created_at AT TIME ZONE 'UTC')::date
WHERE eval_date IS NULL;

ALTER TABLE response_evaluations
  ALTER COLUMN eval_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_response_evaluations_message_id
  ON response_evaluations(message_id);

CREATE INDEX IF NOT EXISTS idx_response_evaluations_created_at
  ON response_evaluations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_evaluations_hallucination
  ON response_evaluations(hallucination_flag);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_response_eval_input_hash_daily
  ON response_evaluations(input_hash, eval_date);
