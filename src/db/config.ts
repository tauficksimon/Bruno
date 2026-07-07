import { pool } from "./pool.js";

export async function getConfigValue<T = unknown>(key: string): Promise<T | undefined> {
  const result = await pool.query<{ value: T }>("SELECT value FROM config_values WHERE key = $1", [key]);
  return result.rows[0]?.value;
}

export async function setConfigValue(key: string, value: unknown) {
  await pool.query(
    `
      INSERT INTO config_values (key, value, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = now()
    `,
    [key, JSON.stringify(value)]
  );
}

export async function deleteConfigValue(key: string) {
  await pool.query("DELETE FROM config_values WHERE key = $1", [key]);
}

export async function getBooleanConfig(key: string, fallback = false): Promise<boolean> {
  const value = await getConfigValue<unknown>(key);
  return typeof value === "boolean" ? value : fallback;
}

export async function isAgentPaused() {
  return getBooleanConfig("agent_paused", false);
}

export async function setAgentPaused(paused: boolean) {
  await setConfigValue("agent_paused", paused);
}

/**
 * Alert-once helper. Returns true only when this call first activates the alert.
 * Call clearAlertOnce when the condition is healthy again.
 */
export async function activateAlertOnce(key: string, details: unknown = {}) {
  const result = await pool.query<{ key: string }>(
    `
      INSERT INTO config_values (key, value, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `,
    [`alert:${key}`, JSON.stringify({ active: true, first_alerted_at: new Date().toISOString(), details })]
  );

  return result.rowCount === 1;
}

export async function clearAlertOnce(key: string) {
  await deleteConfigValue(`alert:${key}`);
}
