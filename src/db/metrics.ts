import { pool } from "./pool.js";

export interface DailyMetricInput {
  metricDate: string;
  campaignId?: string;
  campaignName?: string;
  sends: number;
  replies: number;
  positiveReplies: number;
  meetings: number;
  placements: number;
  bounces: number;
  unsubscribes: number;
  raw: unknown;
}

export interface DailyMetricRow {
  metric_date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  sends: number;
  replies: number;
  positive_replies: number;
  meetings: number;
  placements: number;
  bounces: number;
  unsubscribes: number;
}

export async function upsertDailyMetric(input: DailyMetricInput) {
  await pool.query(
    `
      INSERT INTO metrics_daily (
        metric_date,
        campaign_id,
        campaign_name,
        sends,
        replies,
        positive_replies,
        meetings,
        placements,
        bounces,
        unsubscribes,
        raw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (metric_date, campaign_id) DO UPDATE
      SET campaign_name = EXCLUDED.campaign_name,
          sends = EXCLUDED.sends,
          replies = EXCLUDED.replies,
          positive_replies = EXCLUDED.positive_replies,
          meetings = EXCLUDED.meetings,
          placements = EXCLUDED.placements,
          bounces = EXCLUDED.bounces,
          unsubscribes = EXCLUDED.unsubscribes,
          raw = EXCLUDED.raw
    `,
    [
      input.metricDate,
      input.campaignId ?? null,
      input.campaignName ?? null,
      input.sends,
      input.replies,
      input.positiveReplies,
      input.meetings,
      input.placements,
      input.bounces,
      input.unsubscribes,
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
        sends,
        replies,
        positive_replies,
        meetings,
        placements,
        bounces,
        unsubscribes
      FROM metrics_daily
      WHERE metric_date >= current_date - ($1::text || ' days')::interval
      ORDER BY metric_date DESC, campaign_name ASC NULLS LAST
    `,
    [days]
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
