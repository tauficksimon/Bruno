import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";

const slack = env.SLACK_BOT_TOKEN ? new WebClient(env.SLACK_BOT_TOKEN) : null;

export async function postSlackMessage(channel: string, text: string) {
  if (!slack) {
    console.log(`[slack:${channel}] ${text}`);
    return;
  }

  await slack.chat.postMessage({
    channel,
    text
  });
}

/** Post a message, optionally threaded under a parent message. */
export async function postSlackReply(channel: string, text: string, threadTs?: string) {
  if (!slack) {
    console.log(`[slack:${channel}${threadTs ? `:${threadTs}` : ""}] ${text}`);
    return;
  }

  await slack.chat.postMessage({
    channel,
    text,
    thread_ts: threadTs
  });
}

export async function postHotReply(text: string) {
  await postSlackMessage(env.SLACK_CHANNEL_HOT_REPLIES, text);
}

export async function postError(text: string) {
  await postSlackMessage(env.SLACK_CHANNEL_ERRORS, text);
}

export async function postDailyDigest(text: string) {
  await postSlackMessage(env.SLACK_CHANNEL_DAILY_DIGEST, text);
}

export async function postAnalytics(text: string) {
  await postSlackMessage(env.SLACK_CHANNEL_ANALYTICS, text);
}
