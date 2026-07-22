import { z } from "zod";
import { callClaudeJson, hasClaudeKey } from "../integrations/claude.js";

const analyticsSchema = z.object({
  summary: z.string(),
  recommendations: z.array(
    z.object({
      area: z.enum(["targeting", "copy", "deliverability", "pipeline", "operations"]),
      recommendation: z.string(),
      confidence: z.number().min(0).max(1)
    })
  )
});

const SYSTEM_PROMPT = `
You analyze outbound sales performance. Recommend practical changes based on measured outcomes.
Compare personas and Email-1 A/B variants using reply, positive-reply, meeting, opportunity, and margin outcomes.
Do not call a winner below 150 sends per variant; label smaller samples directional or insufficient.
Open and click metrics may be unavailable when tracking is disabled. Never treat missing tracking as zero engagement.
Profitability can only be claimed when actual revenue and direct-cost records are present.
Do not recommend fully autonomous changes; all changes require human approval.
Return JSON only.
`;

export async function analyzeWeeklyPerformance(metrics: unknown) {
  if (!hasClaudeKey()) {
    return {
      summary: "Claude is not configured. Weekly analytics placeholder generated locally.",
      recommendations: []
    };
  }

  return callClaudeJson({
    model: "strong",
    system: SYSTEM_PROMPT,
    user: JSON.stringify(metrics, null, 2),
    schema: analyticsSchema,
    maxTokens: 1500
  });
}
