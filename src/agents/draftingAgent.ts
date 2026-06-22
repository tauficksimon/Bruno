import { z } from "zod";
import { callClaudeJson, hasClaudeKey } from "../integrations/claude.js";
import type { DraftedReply, ReplyClassification } from "../types/domain.js";

const draftSchema = z.object({
  subject: z.string().optional(),
  body: z.string(),
  internalReason: z.string()
});

const SYSTEM_PROMPT = `
You draft concise sales replies for a Honduras-based nearshore staffing company selling vetted talent to US companies.

Rules:
- Sound direct and professional.
- Do not over-explain.
- Do not invent facts.
- If the prospect is interested, move toward a short discovery call.
- If the prospect has an objection, answer it briefly and move toward a call.
- Return JSON only.
`;

export async function draftReply(input: {
  companyName?: string;
  email?: string;
  threadText: string;
  classification: ReplyClassification;
}): Promise<DraftedReply> {
  if (!hasClaudeKey()) {
    return {
      body: "Thanks for the reply. Happy to share more context and see if this is relevant. Are you open to a quick call this week?",
      internalReason: "Local fallback draft because ANTHROPIC_API_KEY is not configured."
    };
  }

  return callClaudeJson({
    model: "strong",
    system: SYSTEM_PROMPT,
    user: JSON.stringify(input, null, 2),
    schema: draftSchema,
    maxTokens: 1200
  });
}
