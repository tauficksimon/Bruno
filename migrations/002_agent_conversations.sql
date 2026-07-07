-- Conversation memory for the outbound agent (boss <-> agent chat).
-- One row per turn, keyed by a thread (Slack channel+thread_ts, or DM channel).

CREATE TABLE IF NOT EXISTS agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_conversations_thread_idx
  ON agent_conversations (thread_key, created_at);
