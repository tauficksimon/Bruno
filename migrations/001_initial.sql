CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_after, created_at);

CREATE TABLE IF NOT EXISTS lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'apollo',
  provider_lead_id text,
  email text,
  company_name text,
  score integer NOT NULL,
  tier integer NOT NULL,
  reason text NOT NULL,
  recommended_campaign text,
  raw_input jsonb,
  raw_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reply_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id),
  email text,
  company_name text,
  intent text NOT NULL,
  confidence numeric NOT NULL,
  reason text NOT NULL,
  suggested_next_action text,
  raw_thread text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_classification_id uuid REFERENCES reply_classifications(id),
  status text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'approved', 'rejected', 'sent')),
  subject text,
  body text NOT NULL,
  internal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES drafts(id),
  action text NOT NULL CHECK (action IN ('approved', 'edited', 'rejected')),
  actor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hubspot_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_type text NOT NULL,
  local_id text NOT NULL,
  hubspot_object_type text NOT NULL,
  hubspot_object_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (local_type, local_id, hubspot_object_type)
);

CREATE TABLE IF NOT EXISTS suppression_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  provider text,
  provider_lead_id text,
  reason text NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  campaign_id text,
  campaign_name text,
  sends integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  positive_replies integer NOT NULL DEFAULT 0,
  meetings integer NOT NULL DEFAULT 0,
  placements integer NOT NULL DEFAULT 0,
  bounces integer NOT NULL DEFAULT 0,
  unsubscribes integer NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_date, campaign_id)
);

CREATE TABLE IF NOT EXISTS metrics_weekly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  summary text,
  recommendations jsonb,
  raw_metrics jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL,
  message text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cached_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config_values (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
