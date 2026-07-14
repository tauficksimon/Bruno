import { activateAlertOnce, clearAlertOnce, isAgentPaused, setConfigValue } from "../db/config.js";
import { recordEvent } from "../db/events.js";
import { listInstantlyCampaigns, listRecentReplies } from "../integrations/instantly.js";
import { postError } from "../integrations/slack.js";
import { enqueueJob, type QueueJob } from "../queue/queue.js";
import { normalizeInstantlyEvent } from "../webhooks/normalizeInstantlyEvent.js";

export interface ReplyPollPayload {
  campaignId?: string;
  lookbackMinutes?: number;
  limit?: number;
}

export async function processReplyPollJob(job: QueueJob) {
  const payload = job.payload as ReplyPollPayload;

  if (await isAgentPaused()) {
    if (await activateAlertOnce("reply-poll-paused")) {
      await postError("Agent kill switch is on. Skipping reply polling so no new classify/draft work starts.");
    }
    return;
  }
  await clearAlertOnce("reply-poll-paused");

  const lookbackMinutes = payload.lookbackMinutes ?? 60 * 24;
  const minTimestampCreated = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
  const limit = payload.limit ?? 50;
  const campaigns = payload.campaignId
    ? [{ id: payload.campaignId, name: payload.campaignId }]
    : await listInstantlyCampaigns({ limit: 100 });

  for (const campaign of campaigns) {
    const replies = await listRecentReplies({
      campaignId: campaign.id,
      limit,
      latestOfThread: false,
      minTimestampCreated
    });

    for (const reply of replies) {
      const rawEmail = isRecord(reply.raw) ? reply.raw : {};
      const event = normalizeInstantlyEvent({
        event_type: "email.received",
        ...rawEmail,
        data: {
          ...rawEmail,
          id: reply.id,
          campaign_id: reply.campaignId ?? campaign.id,
          lead_id: reply.leadId,
          email: reply.leadEmail ?? reply.fromEmail,
          thread_text: reply.threadText ?? reply.preview,
          subject: reply.subject,
          timestamp_created: reply.timestampCreated
        }
      });

      const recorded = await recordEvent({
        provider: "instantly",
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        payload: event.raw
      });

      if (!recorded.inserted) continue;
      await enqueueJob("instantly.event.received", {
        eventId: recorded.id,
        event
      });
    }
  }

  // Heartbeat: the dashboard's "replies last checked X ago" reads this.
  await setConfigValue("last_poll_success_at", new Date().toISOString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
