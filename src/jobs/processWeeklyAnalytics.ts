import { analyzeWeeklyPerformance } from "../agents/analyticsAgent.js";
import { getIntentCountsSince, listRecentDailyMetrics } from "../db/metrics.js";
import { postAnalytics } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";

export async function processWeeklyAnalyticsJob(_job: QueueJob) {
  const [metrics, intentCounts] = await Promise.all([listRecentDailyMetrics(7), getIntentCountsSince(24 * 7)]);

  if (metrics.length === 0) {
    await postAnalytics("Weekly analytics skipped: no metrics_daily rows exist yet, so there is no real campaign data to analyze.");
    return;
  }

  const analysis = await analyzeWeeklyPerformance({ metrics, intentCounts });

  await postAnalytics(`${analysis.summary}\n\n${analysis.recommendations.map((r) => `- ${r.area}: ${r.recommendation}`).join("\n")}`);
}
