import { pool } from "./pool.js";

export async function getCachedValue<T>(key: string): Promise<T | undefined> {
  const result = await pool.query<{ value: T }>(
    "SELECT value FROM cached_records WHERE cache_key = $1 AND expires_at > now()",
    [key]
  );
  return result.rows[0]?.value;
}

export async function setCachedValue(key: string, value: unknown, ttlSeconds: number) {
  await pool.query(
    `
      INSERT INTO cached_records (cache_key, value, expires_at)
      VALUES ($1, $2::jsonb, now() + ($3::text || ' seconds')::interval)
      ON CONFLICT (cache_key) DO UPDATE
      SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = now()
    `,
    [key, JSON.stringify(value), ttlSeconds]
  );
}

/**
 * Read-through cache: serve from cached_records, else run the loader and store.
 * Loader failures propagate — callers decide how to degrade.
 */
export async function cachedFetch<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const hit = await getCachedValue<T>(key);
  if (hit !== undefined) return hit;
  const fresh = await loader();
  await setCachedValue(key, fresh, ttlSeconds);
  return fresh;
}
