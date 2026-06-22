import { pool } from "./pool.js";

export async function saveSuppression(input: {
  email?: string;
  provider?: string;
  providerLeadId?: string;
  reason: string;
  rawPayload?: unknown;
}) {
  await pool.query(
    `
      INSERT INTO suppression_events (
        email,
        provider,
        provider_lead_id,
        reason,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.email,
      input.provider,
      input.providerLeadId,
      input.reason,
      JSON.stringify(input.rawPayload ?? {})
    ]
  );
}
