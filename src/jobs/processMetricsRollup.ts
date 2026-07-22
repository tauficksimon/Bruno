import { KINTA_PERSONA_CAMPAIGNS } from "../campaigns/kintaPersonaCampaigns.js";
import { upsertDailyMetric, upsertVariantDailyMetric } from "../db/metrics.js";
import { getCampaignAnalyticsOverview, getCampaignStepAnalytics, listInstantlyCampaigns } from "../integrations/instantly.js";
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
    const [analytics, steps] = await Promise.all([
      getCampaignAnalyticsOverview({
        campaignId: campaign.id,
        startDate: metricDate,
        endDate: metricDate
      }),
      getCampaignStepAnalytics({
        campaignId: campaign.id,
        startDate: metricDate,
        endDate: metricDate
      })
    ]);
    const raw = analytics as unknown as Record<string, unknown>;
    const persona = KINTA_PERSONA_CAMPAIGNS.find((entry) => entry.name === campaign.name)?.persona;

    await upsertDailyMetric({
      metricDate,
      campaignId: campaign.id,
      campaignName: campaign.name,
      persona,
      contacted: numberField(raw.contacted_count),
      sends: numberField(raw.emails_sent_count),
      opens: numberField(raw.open_count_unique),
      clicks: numberField(raw.link_click_count_unique ?? raw.link_click_count),
      replies: numberField(raw.reply_count_unique ?? raw.reply_count),
      positiveReplies: numberField(raw.total_interested),
      meetings: numberField(raw.total_meeting_booked ?? raw.total_meeting_completed),
      placements: numberField(raw.total_closed),
      bounces: numberField(raw.bounced_count),
      unsubscribes: numberField(raw.unsubscribed_count),
      opportunities: numberField(raw.total_opportunities),
      opportunityValue: numberField(raw.total_opportunity_value),
      raw
    });

    for (const step of steps) {
      if (step.step === null || step.variant === null) continue;
      const stepNumber = Number(step.step);
      const variantNumber = Number(step.variant);
      if (!Number.isInteger(stepNumber) || !Number.isInteger(variantNumber)) continue;
      await upsertVariantDailyMetric({
        metricDate,
        campaignId: campaign.id,
        campaignName: campaign.name,
        persona,
        step: stepNumber,
        variant: variantNumber,
        sends: step.sent,
        uniqueOpens: step.unique_opened,
        uniqueClicks: step.unique_clicks,
        uniqueReplies: step.unique_replies,
        automaticReplies: step.unique_replies_automatic,
        uniqueOpportunities: step.unique_opportunities ?? 0,
        raw: step
      });
    }
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
