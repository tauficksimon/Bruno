CREATE INDEX IF NOT EXISTS jobs_stale_running_idx
  ON jobs (status, locked_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS drafts_status_created_idx
  ON drafts (status, created_at);

CREATE INDEX IF NOT EXISTS reply_classifications_created_intent_idx
  ON reply_classifications (created_at, intent);

INSERT INTO config_values (key, value)
VALUES ('agent_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
