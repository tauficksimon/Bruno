import { isAgentPaused } from "../db/config.js";
import { getIntentCountsSince, getPendingDraftCount, getQueueSummary, listRecentDailyMetrics } from "../db/metrics.js";
import { listInstantlyAccounts, getWarmupAnalytics } from "../integrations/instantly.js";
import { postDailyDigest } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";

export async function processDailyDigestJob(_job: QueueJob) {
  const [metrics, intentCounts, pendingDrafts, queueSummary, paused] = await Promise.all([
    listRecentDailyMetrics(2),
    getIntentCountsSince(24),
    getPendingDraftCount(),
    getQueueSummary(),
    isAgentPaused()
  ]);

  let warmupLines: string[] = [];
  try {
    const accounts = await listInstantlyAccounts({ limit: 100 });
    const emails = accounts.map((account) => account.email).filter(Boolean);
    const warmup = emails.length > 0 ? await getWarmupAnalytics(emails) : [];
    warmupLines = warmup.map(
      (item) =>
        `${item.email}: ${Math.round(item.inboxLandingRate * 100)}% inbox landing, ${item.last7DaysSent} warmup sent in 7d`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warmupLines = [`Warmup lookup failed: ${message}`];
  }

  const metricLines =
    metrics.length > 0
      ? metrics.map((row) => {
          const replyRate = row.sends > 0 ? `${((row.replies / row.sends) * 100).toFixed(1)}%` : "n/a";
          const bounceRate = row.sends > 0 ? `${((row.bounces / row.sends) * 100).toFixed(1)}%` : "n/a";
          return `${row.metric_date} ${row.campaign_name ?? row.campaign_id ?? "campaign"}: ${row.sends} sent, ${row.replies} replies (${replyRate}), ${row.positive_replies} positive, ${row.bounces} bounces (${bounceRate}), ${row.unsubscribes} unsubscribes`;
        })
      : ["No metrics_daily rows yet. Run metrics.rollup after the first live sends."];

  const intents =
    Object.keys(intentCounts).length > 0
      ? Object.entries(intentCounts)
          .map(([intent, count]) => `${intent}: ${count}`)
          .join(", ")
      : "none in the last 24h";

  await postDailyDigest(
    [
      `Daily standup (${new Date().toISOString().slice(0, 10)})`,
      `Agent paused: ${paused ? "yes" : "no"}`,
      "",
      "Metrics:",
      ...metricLines.map((line) => `- ${line}`),
      "",
      `Reply intents, last 24h: ${intents}`,
      `Pending drafts: ${pendingDrafts}`,
      `Queue: queued ${queueSummary.queued ?? 0}, running ${queueSummary.running ?? 0}, failed ${queueSummary.failed ?? 0}`,
      "",
      "Warmup:",
      ...warmupLines.map((line) => `- ${line}`)
    ].join("\n")
  );
}
