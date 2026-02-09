-- WF1 production fix: allow two rows per external event (user + bot) in messages
-- Keep idempotency responsibility in external_events(source, external_event_id)

DROP INDEX IF EXISTS uniq_messages_channel_external;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_channel_external_sender
  ON messages(channel, external_event_id, sender)
  WHERE external_event_id IS NOT NULL;
