import { analyzeWeeklyPerformance } from "../agents/analyticsAgent.js";
import {
  getIntentCountsSince,
  listPersonaProfitability,
  listRecentDailyMetrics,
  listRecentVariantMetrics
} from "../db/metrics.js";
import { notifyAnalytics } from "../integrations/notify.js";
import type { QueueJob } from "../queue/queue.js";

export async function processWeeklyAnalyticsJob(_job: QueueJob) {
  const [metrics, variants, profitability, intentCounts] = await Promise.all([
    listRecentDailyMetrics(7),
    listRecentVariantMetrics(7),
    listPersonaProfitability(),
    getIntentCountsSince(24 * 7)
  ]);

  if (metrics.length === 0) {
    await notifyAnalytics("Weekly analytics skipped: no metrics_daily rows exist yet, so there is no real campaign data to analyze.");
    return;
  }

  const analysis = await analyzeWeeklyPerformance({ metrics, variants, profitability, intentCounts });

  await notifyAnalytics(`${analysis.summary}\n\n${analysis.recommendations.map((r) => `- ${r.area}: ${r.recommendation}`).join("\n")}`);
}
