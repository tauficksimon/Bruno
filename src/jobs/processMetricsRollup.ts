import { upsertDailyMetric } from "../db/metrics.js";
import { getCampaignAnalyticsOverview, listInstantlyCampaigns } from "../integrations/instantly.js";
import type { QueueJob } from "../queue/queue.js";

export interface MetricsRollupPayload {
  metricDate?: string;
  scheduledAt?: string;
}

export async function processMetricsRollupJob(job: QueueJob) {
  const payload = job.payload as MetricsRollupPayload;
  const metricDate = payload.metricDate ?? isoDate(payload.scheduledAt ? new Date(payload.scheduledAt) : new Date());
  const campaigns = await listInstantlyCampaigns({ limit: 100 });

  for (const campaign of campaigns) {
    const analytics = await getCampaignAnalyticsOverview({
      campaignId: campaign.id,
      startDate: metricDate,
      endDate: metricDate
    });
    const raw = analytics as unknown as Record<string, unknown>;

    await upsertDailyMetric({
      metricDate,
      campaignId: campaign.id,
      campaignName: campaign.name,
      sends: numberField(raw.emails_sent_count),
      replies: numberField(raw.reply_count),
      positiveReplies: numberField(raw.total_interested ?? raw.total_opportunities),
      meetings: numberField(raw.total_meeting_booked) + numberField(raw.total_meeting_completed),
      placements: numberField(raw.total_closed),
      bounces: numberField(raw.bounced_count),
      unsubscribes: numberField(raw.unsubscribed_count),
      raw
    });
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
