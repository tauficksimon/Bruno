// Bruno's proactive voice. Every update lands in the console's # updates
// channel (a conversation thread the owner can reply to inline) and falls
// through to Slack when that's configured (it logs to console otherwise).

import { appendConversationTurn } from "../db/conversations.js";
import { postAnalytics, postDailyDigest, postError, postHotReply } from "./slack.js";

export const UPDATES_THREAD_KEY = "channel:updates";

type UpdateKind = "digest" | "alert" | "hot" | "analytics";

const KIND_TAG: Record<UpdateKind, string> = {
  digest: "📋",
  alert: "⚠️",
  hot: "🔥",
  analytics: "📈"
};

async function postToChannel(kind: UpdateKind, text: string) {
  try {
    await appendConversationTurn(UPDATES_THREAD_KEY, "assistant", `${KIND_TAG[kind]} ${text}`);
  } catch {
    // The channel is best-effort — never let it break the job that posted.
  }
}

export async function notifyDigest(text: string) {
  await postToChannel("digest", text);
  await postDailyDigest(text);
}

export async function notifyAlert(text: string) {
  await postToChannel("alert", text);
  await postError(text);
}

export async function notifyHotReply(text: string) {
  await postToChannel("hot", text);
  await postHotReply(text);
}

export async function notifyAnalytics(text: string) {
  await postToChannel("analytics", text);
  await postAnalytics(text);
}
