import { runOutboundAgent } from "../agents/outboundAgent.js";
import { appendConversationTurn, appendConversationTurnIfLatestDiffers, loadConversation } from "../db/conversations.js";
import { postSlackReply } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";

export interface OutboundAgentReplyPayload {
  threadKey: string;
  channel: string;
  threadTs?: string;
  text: string;
}

/**
 * Handle one inbound Slack message to the outbound agent:
 * record it, run the agent over the thread's history, persist the answer, and
 * post it back into the same Slack thread.
 */
export async function processOutboundAgentReplyJob(job: QueueJob) {
  const { threadKey, channel, threadTs, text } = job.payload as OutboundAgentReplyPayload;

  await appendConversationTurnIfLatestDiffers(threadKey, "user", text);
  const history = await loadConversation(threadKey, 20);

  const result = await runOutboundAgent(history);

  await appendConversationTurn(threadKey, "assistant", result.text);
  await postSlackReply(channel, result.text, threadTs);
}
