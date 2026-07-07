import { z } from "zod";
import { callClaudeJson, hasClaudeKey } from "../integrations/claude.js";
import type { LeadScore } from "../types/domain.js";

const leadScoreSchema = z.object({
  score: z.number().min(0).max(100),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  reason: z.string(),
  recommendedCampaign: z.string().optional()
});

const SYSTEM_PROMPT = `
You score sales leads for a nearshore staffing company in Central America selling to US companies.

Prefer companies with active hiring signals, clear roles that can be staffed remotely/nearshore, and enough business maturity to buy services.
Return JSON only.
`;

export async function scoreLead(lead: unknown): Promise<LeadScore> {
  if (!hasClaudeKey()) {
    return {
      score: 50,
      tier: 3,
      reason: "Local fallback score because ANTHROPIC_API_KEY is not configured."
    };
  }

  return callClaudeJson({
    model: "fast",
    system: SYSTEM_PROMPT,
    user: JSON.stringify(lead, null, 2),
    schema: leadScoreSchema,
    maxTokens: 700
  });
}
