CREATE TABLE IF NOT EXISTS wf1_learning_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL CHECK (
    run_type IN ('build_exemplars', 'promote_exemplars', 'rollback_exemplars', 'weekly_report')
  ),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  autopromoted BOOLEAN,
  autorolledback BOOLEAN,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wf1_learning_runs_type_created
  ON wf1_learning_runs(run_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wf1_learning_runs_status_created
  ON wf1_learning_runs(status, created_at DESC);
