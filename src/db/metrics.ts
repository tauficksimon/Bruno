import { pool } from "./pool.js";

export interface DailyMetricInput {
  metricDate: string;
  campaignId?: string;
  campaignName?: string;
  persona?: string;
  contacted: number;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
  positiveReplies: number;
  meetings: number;
  placements: number;
  bounces: number;
  unsubscribes: number;
  opportunities: number;
  opportunityValue: number;
  raw: unknown;
}

export interface DailyMetricRow {
  metric_date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  persona: string | null;
  contacted: number;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
  positive_replies: number;
  meetings: number;
  placements: number;
  bounces: number;
  unsubscribes: number;
  opportunities: number;
  opportunity_value: number;
}

export async function upsertDailyMetric(input: DailyMetricInput) {
  await pool.query(
    `
      INSERT INTO metrics_daily (
        metric_date,
        campaign_id,
        campaign_name,
        persona,
        contacted,
        sends,
        opens,
        clicks,
        replies,
        positive_replies,
        meetings,
        placements,
        bounces,
        unsubscribes,
        opportunities,
        opportunity_value,
        raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
      ON CONFLICT (metric_date, campaign_id) DO UPDATE
      SET campaign_name = EXCLUDED.campaign_name,
          persona = EXCLUDED.persona,
          contacted = EXCLUDED.contacted,
          sends = EXCLUDED.sends,
          opens = EXCLUDED.opens,
          clicks = EXCLUDED.clicks,
          replies = EXCLUDED.replies,
          positive_replies = EXCLUDED.positive_replies,
          meetings = EXCLUDED.meetings,
          placements = EXCLUDED.placements,
          bounces = EXCLUDED.bounces,
          unsubscribes = EXCLUDED.unsubscribes,
          opportunities = EXCLUDED.opportunities,
          opportunity_value = EXCLUDED.opportunity_value,
          raw = EXCLUDED.raw
    `,
    [
      input.metricDate,
      input.campaignId ?? null,
      input.campaignName ?? null,
      input.persona ?? null,
      input.contacted,
      input.sends,
      input.opens,
      input.clicks,
      input.replies,
      input.positiveReplies,
      input.meetings,
      input.placements,
      input.bounces,
      input.unsubscribes,
      input.opportunities,
      input.opportunityValue,
      JSON.stringify(input.raw ?? {})
    ]
  );
}

export async function listRecentDailyMetrics(days = 7): Promise<DailyMetricRow[]> {
  const result = await pool.query<DailyMetricRow>(
    `
      SELECT
        metric_date::text,
        campaign_id,
        campaign_name,
        persona,
        contacted,
        sends,
        opens,
        clicks,
        replies,
        positive_replies,
        meetings,
        placements,
        bounces,
        unsubscribes,
        opportunities,
        opportunity_value::float AS opportunity_value
      FROM metrics_daily
      WHERE metric_date >= current_date - ($1::text || ' days')::interval
      ORDER BY metric_date DESC, campaign_name ASC NULLS LAST
    `,
    [days]
  );

  return result.rows;
}

export interface VariantDailyMetricInput {
  metricDate: string;
  campaignId: string;
  campaignName?: string;
  persona?: string;
  step: number;
  variant: number;
  sends: number;
  uniqueOpens: number;
  uniqueClicks: number;
  uniqueReplies: number;
  automaticReplies: number;
  uniqueOpportunities: number;
  raw: unknown;
}

export interface VariantDailyMetricRow {
  metric_date: string;
  campaign_id: string;
  campaign_name: string | null;
  persona: string | null;
  step: number;
  variant: number;
  sends: number;
  unique_opens: number;
  unique_clicks: number;
  unique_replies: number;
  automatic_replies: number;
  unique_opportunities: number;
}

export async function upsertVariantDailyMetric(input: VariantDailyMetricInput) {
  await pool.query(
    `
      INSERT INTO metrics_variant_daily (
        metric_date, campaign_id, campaign_name, persona, step, variant,
        sends, unique_opens, unique_clicks, unique_replies,
        automatic_replies, unique_opportunities, raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      ON CONFLICT (metric_date, campaign_id, step, variant) DO UPDATE
      SET campaign_name = EXCLUDED.campaign_name,
          persona = EXCLUDED.persona,
          sends = EXCLUDED.sends,
          unique_opens = EXCLUDED.unique_opens,
          unique_clicks = EXCLUDED.unique_clicks,
          unique_replies = EXCLUDED.unique_replies,
          automatic_replies = EXCLUDED.automatic_replies,
          unique_opportunities = EXCLUDED.unique_opportunities,
          raw = EXCLUDED.raw,
          updated_at = now()
    `,
    [
      input.metricDate,
      input.campaignId,
      input.campaignName ?? null,
      input.persona ?? null,
      input.step,
      input.variant,
      input.sends,
      input.uniqueOpens,
      input.uniqueClicks,
      input.uniqueReplies,
      input.automaticReplies,
      input.uniqueOpportunities,
      JSON.stringify(input.raw ?? {})
    ]
  );
}

export async function listRecentVariantMetrics(days = 7): Promise<VariantDailyMetricRow[]> {
  const result = await pool.query<VariantDailyMetricRow>(
    `
      SELECT metric_date::text, campaign_id, campaign_name, persona, step, variant,
             sends, unique_opens, unique_clicks, unique_replies,
             automatic_replies, unique_opportunities
      FROM metrics_variant_daily
      WHERE metric_date >= current_date - ($1::text || ' days')::interval
      ORDER BY metric_date DESC, campaign_name, step, variant
    `,
    [days]
  );
  return result.rows;
}

export interface PersonaProfitabilityRow {
  persona: string;
  currency: string;
  outcomes: number;
  revenue: number;
  direct_cost: number;
  gross_profit: number;
}

export interface CommercialOutcomeInput {
  leadEmail?: string;
  campaignId?: string;
  persona: string;
  outcome: string;
  revenue: number;
  directCost: number;
  currency?: string;
  source?: string;
  notes?: string;
  occurredAt?: string;
}

export interface CommercialOutcomeRow {
  id: string;
  persona: string;
  outcome: string;
  revenue: number;
  direct_cost: number;
  gross_profit: number;
  currency: string;
  occurred_at: string;
}

/** Store only operator-reported commercial facts; callers must never infer these values. */
export async function recordCommercialOutcome(input: CommercialOutcomeInput): Promise<CommercialOutcomeRow> {
  const result = await pool.query<CommercialOutcomeRow>(
    `
      INSERT INTO commercial_outcomes (
        lead_email, campaign_id, persona, outcome, revenue, direct_cost,
        currency, source, notes, occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, now()))
      RETURNING id, persona, outcome, revenue::float, direct_cost::float,
                (revenue - direct_cost)::float AS gross_profit,
                currency, occurred_at::text
    `,
    [
      input.leadEmail ?? null,
      input.campaignId ?? null,
      input.persona,
      input.outcome,
      input.revenue,
      input.directCost,
      input.currency ?? "USD",
      input.source ?? "bruno-chat",
      input.notes ?? null,
      input.occurredAt ?? null
    ]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Commercial outcome was not stored");
  return row;
}

export async function listPersonaProfitability(): Promise<PersonaProfitabilityRow[]> {
  const result = await pool.query<PersonaProfitabilityRow>(
    `
      SELECT persona,
             currency,
             count(*)::int AS outcomes,
             sum(revenue)::float AS revenue,
             sum(direct_cost)::float AS direct_cost,
             (sum(revenue) - sum(direct_cost))::float AS gross_profit
      FROM commercial_outcomes
      GROUP BY persona, currency
      ORDER BY gross_profit DESC
    `
  );
  return result.rows;
}

export async function getPendingDraftCount() {
  const result = await pool.query<{ count: string }>("SELECT count(*) FROM drafts WHERE status = 'drafted'");
  return Number(result.rows[0]?.count ?? 0);
}

export async function getDraftsPendingLongerThan(hours: number) {
  const result = await pool.query<{ count: string; oldest_minutes: string | null }>(
    `
      SELECT
        count(*)::text AS count,
        floor(EXTRACT(EPOCH FROM (now() - min(created_at))) / 60)::text AS oldest_minutes
      FROM drafts
      WHERE status = 'drafted'
        AND created_at < now() - ($1::text || ' hours')::interval
    `,
    [hours]
  );

  return {
    count: Number(result.rows[0]?.count ?? 0),
    oldestMinutes: result.rows[0]?.oldest_minutes ? Number(result.rows[0].oldest_minutes) : undefined
  };
}

export async function getOldestQueuedJobAgeMinutes() {
  const result = await pool.query<{ oldest_minutes: string | null }>(
    `
      SELECT floor(EXTRACT(EPOCH FROM (now() - min(run_after))) / 60)::text AS oldest_minutes
      FROM jobs
      WHERE status = 'queued'
        AND run_after <= now()
    `
  );

  return result.rows[0]?.oldest_minutes ? Number(result.rows[0].oldest_minutes) : undefined;
}

export async function getQueueSummary() {
  const result = await pool.query<{ status: string; count: string }>(
    `
      SELECT status, count(*)::text AS count
      FROM jobs
      WHERE status IN ('queued', 'running', 'failed')
      GROUP BY status
    `
  );

  return Object.fromEntries(result.rows.map((row) => [row.status, Number(row.count)])) as Partial<
    Record<"queued" | "running" | "failed", number>
  >;
}

export async function getIntentCountsSince(hours: number) {
  const result = await pool.query<{ intent: string; count: string }>(
    `
      SELECT intent, count(*)::text AS count
      FROM reply_classifications
      WHERE created_at >= now() - ($1::text || ' hours')::interval
      GROUP BY intent
      ORDER BY intent
    `,
    [hours]
  );

  return Object.fromEntries(result.rows.map((row) => [row.intent, Number(row.count)]));
}
