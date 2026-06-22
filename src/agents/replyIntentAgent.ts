import { z } from "zod";
import { callClaudeJson, hasClaudeKey } from "../integrations/claude.js";
import type { ReplyClassification } from "../types/domain.js";

const replyClassificationSchema = z.object({
  intent: z.enum(["positive", "question", "objection", "not_now", "negative", "unsubscribe", "unclear"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  suggestedNextAction: z.string()
});

const SYSTEM_PROMPT = `
You classify outbound sales replies for a Honduras-based nearshore staffing company selling talent services to US companies.

Classify only the prospect's business intent.
Use:
- positive: interested in talking or asks to schedule
- question: asks for details without clear objection
- objection: concern about price, quality, timing, trust, location, model, or process
- not_now: explicitly says later, next quarter, check back, already filled
- negative: no interest or poor fit
- unsubscribe: asks to opt out or stop emailing
- unclear: cannot decide safely

Return concise JSON.
`;

export async function classifyReply(input: {
  companyName?: string;
  email?: string;
  threadText: string;
}): Promise<ReplyClassification> {
  if (!hasClaudeKey()) {
    return heuristicClassifyReply(input.threadText);
  }

  return callClaudeJson({
    model: "fast",
    system: SYSTEM_PROMPT,
    user: JSON.stringify(input, null, 2),
    schema: replyClassificationSchema,
    maxTokens: 700
  });
}

function heuristicClassifyReply(threadText: string): ReplyClassification {
  const text = threadText.toLowerCase();

  if (text.includes("unsubscribe") || text.includes("remove me") || text.includes("stop emailing")) {
    return {
      intent: "unsubscribe",
      confidence: 0.8,
      reason: "Local fallback detected unsubscribe language.",
      suggestedNextAction: "Suppress the contact and log the unsubscribe."
    };
  }

  if (text.includes("not interested") || text.includes("no thanks")) {
    return {
      intent: "negative",
      confidence: 0.65,
      reason: "Local fallback detected negative language.",
      suggestedNextAction: "Mark unqualified unless a human overrides."
    };
  }

  if (text.includes("interested") || text.includes("send more") || text.includes("book") || text.includes("call")) {
    return {
      intent: "positive",
      confidence: 0.65,
      reason: "Local fallback detected interest language.",
      suggestedNextAction: "Create/update deal, draft response, notify Slack."
    };
  }

  return {
    intent: "unclear",
    confidence: 0.3,
    reason: "No Claude key configured and local fallback could not classify confidently.",
    suggestedNextAction: "Ask a human to classify."
  };
}
