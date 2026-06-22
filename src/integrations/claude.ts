import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../config/env.js";

const client = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

export async function callClaudeJson<T>(
  input: {
    model: "fast" | "strong";
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
  }
): Promise<T> {
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const model = input.model === "fast" ? env.CLAUDE_FAST_MODEL : env.CLAUDE_STRONG_MODEL;
  const response = await client.messages.create({
    model,
    max_tokens: input.maxTokens ?? 1000,
    system: `${input.system}\n\nReturn only valid JSON. Do not include markdown fences.`,
    messages: [
      {
        role: "user",
        content: input.user
      }
    ]
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return input.schema.parse(JSON.parse(text));
}

export function hasClaudeKey() {
  return Boolean(client);
}
