import { postDailyDigest } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";

export async function processDailyDigestJob(_job: QueueJob) {
  await postDailyDigest("Daily digest placeholder: wire metrics query after first live events are stored.");
}
