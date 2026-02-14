ALTER TABLE hitl_golden_examples
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'wf1_learning_runs'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%run_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE wf1_learning_runs DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;

  ALTER TABLE wf1_learning_runs
    ADD CONSTRAINT wf1_learning_runs_run_type_check
    CHECK (
      run_type IN (
        'build_exemplars',
        'promote_exemplars',
        'rollback_exemplars',
        'weekly_report',
        'bootstrap_seeds'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'wf1_intent_exemplars'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%source%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE wf1_intent_exemplars DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;

  ALTER TABLE wf1_intent_exemplars
    ADD CONSTRAINT wf1_intent_exemplars_source_check
    CHECK (source IN ('telemetry', 'feedback', 'manual', 'qa_seed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid = 'hitl_golden_examples'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%source%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE hitl_golden_examples DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;

  ALTER TABLE hitl_golden_examples
    ADD CONSTRAINT hitl_golden_examples_source_check
    CHECK (source IN ('manual', 'telemetry', 'qa_seed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_hitl_golden_source_active
  ON hitl_golden_examples(source, active, created_at DESC);
