ALTER TABLE metrics_daily ADD COLUMN IF NOT EXISTS persona text;
ALTER TABLE metrics_daily ADD COLUMN IF NOT EXISTS contacted integer NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN IF NOT EXISTS opens integer NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN IF NOT EXISTS opportunities integer NOT NULL DEFAULT 0;
ALTER TABLE metrics_daily ADD COLUMN IF NOT EXISTS opportunity_value numeric(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS metrics_daily_persona_date_idx
  ON metrics_daily (persona, metric_date DESC);

CREATE TABLE IF NOT EXISTS metrics_variant_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  persona text,
  step integer NOT NULL,
  variant integer NOT NULL,
  sends integer NOT NULL DEFAULT 0,
  unique_opens integer NOT NULL DEFAULT 0,
  unique_clicks integer NOT NULL DEFAULT 0,
  unique_replies integer NOT NULL DEFAULT 0,
  automatic_replies integer NOT NULL DEFAULT 0,
  unique_opportunities integer NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_date, campaign_id, step, variant)
);

CREATE INDEX IF NOT EXISTS metrics_variant_persona_date_idx
  ON metrics_variant_daily (persona, metric_date DESC, step, variant);

-- Revenue and direct cost are business inputs, not values Bruno should infer.
-- These outcomes let persona reporting progress from replies to actual margin.
CREATE TABLE IF NOT EXISTS commercial_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_email text,
  campaign_id text,
  persona text NOT NULL,
  outcome text NOT NULL,
  revenue numeric(14, 2) NOT NULL DEFAULT 0,
  direct_cost numeric(14, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'manual',
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_outcomes_persona_date_idx
  ON commercial_outcomes (persona, occurred_at DESC);
