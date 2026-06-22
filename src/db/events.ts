import { pool } from "./pool.js";

export async function recordEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: unknown;
}) {
  const result = await pool.query<{ id: string; inserted: boolean }>(
    `
      WITH inserted AS (
        INSERT INTO events (provider, provider_event_id, event_type, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id, true AS inserted
      )
      SELECT id, inserted FROM inserted
      UNION ALL
      SELECT id, false AS inserted
      FROM events
      WHERE provider = $1 AND provider_event_id = $2
      LIMIT 1
    `,
    [input.provider, input.providerEventId, input.eventType, JSON.stringify(input.payload)]
  );

  return result.rows[0];
}

export async function markEventProcessed(eventId: string) {
  await pool.query("UPDATE events SET processed_at = now() WHERE id = $1", [eventId]);
}
