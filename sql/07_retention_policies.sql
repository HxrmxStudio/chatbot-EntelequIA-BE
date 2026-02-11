-- Suggested retention windows:
-- messages: 90 days
-- response_evaluations / hitl_*: 365 days

-- Indexes supporting retention jobs
CREATE INDEX IF NOT EXISTS idx_messages_retention_created_at
  ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_response_evaluations_retention_created_at
  ON response_evaluations(created_at);

CREATE INDEX IF NOT EXISTS idx_hitl_review_queue_retention_sampled_at
  ON hitl_review_queue(sampled_at);

CREATE INDEX IF NOT EXISTS idx_hitl_golden_examples_retention_created_at
  ON hitl_golden_examples(created_at);

-- Runbook cleanup examples:
-- DELETE FROM messages WHERE created_at < now() - interval '90 days';
-- DELETE FROM response_evaluations WHERE created_at < now() - interval '365 days';
-- DELETE FROM hitl_review_queue WHERE sampled_at < now() - interval '365 days';
-- DELETE FROM hitl_golden_examples WHERE created_at < now() - interval '365 days';

