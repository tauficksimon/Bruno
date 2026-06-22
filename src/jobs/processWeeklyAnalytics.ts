import { analyzeWeeklyPerformance } from "../agents/analyticsAgent.js";
import { postAnalytics } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";

export async function processWeeklyAnalyticsJob(_job: QueueJob) {
  const analysis = await analyzeWeeklyPerformance({
    note: "Replace with metrics_daily/metrics_weekly query once live campaigns run."
  });

  await postAnalytics(`${analysis.summary}\n\n${analysis.recommendations.map((r) => `- ${r.area}: ${r.recommendation}`).join("\n")}`);
}
