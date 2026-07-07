import { activateAlertOnce, clearAlertOnce, isAgentPaused } from "../db/config.js";
import { getDraftsPendingLongerThan, getOldestQueuedJobAgeMinutes, listRecentDailyMetrics } from "../db/metrics.js";
import { getWarmupAnalytics, listInstantlyAccounts } from "../integrations/instantly.js";
import { postError, postHotReply } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";

export async function processWatchdogJob(_job: QueueJob) {
  await checkPaused();
  await checkBounceRate();
  await checkWarmup();
  await checkQueueAge();
  await checkStaleDrafts();
}

async function checkPaused() {
  if (await isAgentPaused()) {
    if (await activateAlertOnce("agent-paused-watchdog")) {
      await postError("Agent kill switch is on. Sensing/reporting still runs, but reply polling and drafting actions are paused.");
    }
    return;
  }

  await clearAlertOnce("agent-paused-watchdog");
}

async function checkBounceRate() {
  const latest = await listRecentDailyMetrics(2);
  const latestByCampaign = new Map<string, (typeof latest)[number]>();
  for (const row of latest) {
    const key = row.campaign_id ?? row.campaign_name ?? "unknown";
    if (!latestByCampaign.has(key)) latestByCampaign.set(key, row);
  }

  for (const [key, row] of latestByCampaign) {
    const bounceRate = row.sends > 0 ? row.bounces / row.sends : 0;
    const alertKey = `bounce-rate:${key}`;
    if (row.sends >= 20 && bounceRate > 0.03) {
      if (await activateAlertOnce(alertKey, { sends: row.sends, bounces: row.bounces })) {
        await postError(
          `Watchdog: bounce rate is ${(bounceRate * 100).toFixed(1)}% for ${row.campaign_name ?? key} (${row.bounces}/${row.sends}). Recommend pausing scale until reviewed.`
        );
      }
    } else {
      await clearAlertOnce(alertKey);
    }
  }
}

async function checkWarmup() {
  const accounts = await listInstantlyAccounts({ limit: 100 });
  const emails = accounts.map((account) => account.email).filter(Boolean);
  if (emails.length === 0) return;

  const warmup = await getWarmupAnalytics(emails);
  for (const item of warmup) {
    const alertKey = `warmup:${item.email}`;
    if (item.last7DaysSent > 0 && item.inboxLandingRate < 0.9) {
      if (await activateAlertOnce(alertKey, item)) {
        await postError(
          `Watchdog: warmup inbox landing is ${Math.round(item.inboxLandingRate * 100)}% for ${item.email}, below the 90% threshold.`
        );
      }
    } else {
      await clearAlertOnce(alertKey);
    }
  }
}

async function checkQueueAge() {
  const oldestQueuedMinutes = await getOldestQueuedJobAgeMinutes();
  if (oldestQueuedMinutes !== undefined && oldestQueuedMinutes > 15) {
    if (await activateAlertOnce("queue-oldest", { oldestQueuedMinutes })) {
      await postError(`Watchdog: oldest queued job has waited ${oldestQueuedMinutes} minutes (>15m).`);
    }
    return;
  }

  await clearAlertOnce("queue-oldest");
}

async function checkStaleDrafts() {
  const stale = await getDraftsPendingLongerThan(2);
  if (stale.count > 0) {
    if (await activateAlertOnce("drafts-stale", stale)) {
      await postHotReply(
        `Watchdog: ${stale.count} draft${stale.count === 1 ? "" : "s"} pending review for more than 2 hours${
          stale.oldestMinutes ? ` (oldest ${stale.oldestMinutes} minutes)` : ""
        }.`
      );
    }
    return;
  }

  await clearAlertOnce("drafts-stale");
}
