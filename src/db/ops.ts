import { pool } from "./pool.js";

export interface FailedJobGroup {
  name: string;
  count: number;
  last_failed_at: string;
  latest_error: string | null;
}

export async function getFailedJobGroups(): Promise<FailedJobGroup[]> {
  const result = await pool.query<{ name: string; count: string; last_failed_at: string; latest_error: string | null }>(
    `
      SELECT
        name,
        count(*)::text AS count,
        max(updated_at)::text AS last_failed_at,
        (array_agg(last_error ORDER BY updated_at DESC))[1] AS latest_error
      FROM jobs
      WHERE status = 'failed'
      GROUP BY name
      ORDER BY count(*) DESC
    `
  );
  return result.rows.map((row) => ({
    name: row.name,
    count: Number(row.count),
    last_failed_at: row.last_failed_at,
    latest_error: row.latest_error
  }));
}

/**
 * Re-queue the most recent failed job of a given name. One representative run
 * is enough to tell whether the underlying cause is fixed — recurring jobs
 * (polls, watchdogs) redo the same work anyway, so mass-retrying is waste.
 */
export async function retryLatestFailedJob(name: string) {
  const result = await pool.query<{ id: string }>(
    `
      UPDATE jobs
      SET status = 'queued', attempts = 0, run_after = now(), updated_at = now()
      WHERE id = (
        SELECT id FROM jobs WHERE status = 'failed' AND name = $1
        ORDER BY updated_at DESC LIMIT 1
      )
      RETURNING id
    `,
    [name]
  );
  return result.rowCount === 1;
}

export async function clearFailedJobs(name?: string) {
  const result = await pool.query(
    "DELETE FROM jobs WHERE status = 'failed' AND ($1::text IS NULL OR name = $1)",
    [name ?? null]
  );
  return result.rowCount ?? 0;
}
