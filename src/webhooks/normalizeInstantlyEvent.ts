import type { InstantlyEvent } from "../types/domain.js";

export function normalizeInstantlyEvent(body: unknown): InstantlyEvent {
  const payload = body as Record<string, unknown>;
  const data = (payload.data ?? payload) as Record<string, unknown>;

  const eventType = String(payload.event_type ?? payload.event ?? payload.type ?? "unknown");
  const providerEventId = String(
    payload.id ??
      payload.event_id ??
      data.id ??
      `${eventType}:${data.email ?? data.lead_email ?? Date.now()}`
  );

  return {
    provider: "instantly",
    providerEventId,
    eventType,
    email: stringOrUndefined(data.email ?? data.lead_email),
    companyName: stringOrUndefined(data.company ?? data.company_name),
    campaignId: stringOrUndefined(data.campaign_id),
    leadId: stringOrUndefined(data.lead_id ?? data.id),
    threadText: stringOrUndefined(data.thread_text ?? data.reply_text ?? data.body ?? data.message),
    raw: payload
  };
}

function stringOrUndefined(value: unknown) {
  if (value === null || value === undefined) return undefined;
  return String(value);
}
