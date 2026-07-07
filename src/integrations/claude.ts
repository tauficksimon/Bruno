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
  const activeClient = client;
  const shapeHint = describeZodSchema(input.schema);

  const attempt = async (repairNote?: string): Promise<T> => {
    const response = await activeClient.messages.create({
      model,
      max_tokens: input.maxTokens ?? 1000,
      system: `${input.system}${shapeHint ? `\n\n${shapeHint}` : ""}\n\nReturn a single valid JSON object only. No markdown fences, no prose before or after.${
        repairNote ? `\n\n${repairNote}` : ""
      }`,
      messages: [{ role: "user", content: input.user }]
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return input.schema.parse(JSON.parse(extractJson(text)));
  };

  try {
    return await attempt();
  } catch (error) {
    // One repair pass: feed the parse/validation error back so the model can
    // correct fences, missing fields, or out-of-enum values.
    const message = error instanceof Error ? error.message : String(error);
    return attempt(
      `Your previous reply could not be parsed against the required schema (${message}). Return corrected JSON that matches the schema exactly.`
    );
  }
}

/**
 * Derive a human-readable description of the required output shape from the zod
 * schema, so the prompt tells the model the exact keys/types/enums to return.
 * Without this, "return JSON" leaves the model free to invent its own keys.
 * Best-effort: returns null for shapes it can't introspect.
 */
function describeZodSchema(schema: z.ZodType): string | null {
  const def = getZodDef(schema);
  if (def?.typeName !== "ZodObject") return null;

  const shape = getObjectShape(schema);
  if (!shape) return null;

  const lines: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    const { schema: current, optional } = unwrapZod(field);
    lines.push(`- "${key}": ${describeZodType(current)}${optional ? " (optional)" : ""}`);
  }

  if (lines.length === 0) return null;
  return `Respond with a JSON object with exactly these keys:\n${lines.join("\n")}`;
}

function describeZodType(schema: z.ZodTypeAny): string {
  const def = getZodDef(schema);
  switch (def?.typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodEnum": {
      const values = (schema as unknown as { _def: { values: string[] } })._def.values;
      return `one of [${values.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    case "ZodLiteral": {
      const value = (schema as unknown as { _def: { value: unknown } })._def.value;
      return JSON.stringify(value);
    }
    case "ZodUnion": {
      const options = (schema as unknown as { _def: { options: z.ZodTypeAny[] } })._def.options;
      const literalValues = options
        .map((option) => getZodDef(option)?.typeName === "ZodLiteral" ? (option as unknown as { _def: { value: unknown } })._def.value : undefined)
        .filter((value) => value !== undefined);
      if (literalValues.length === options.length) {
        return `one of [${literalValues.map((value) => JSON.stringify(value)).join(", ")}]`;
      }
      return options.map(describeZodType).join(" or ");
    }
    case "ZodArray": {
      const element = (schema as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
      return `array of ${describeZodType(element)}`;
    }
    case "ZodObject": {
      const shape = getObjectShape(schema);
      if (!shape) return "object";
      const fields = Object.entries(shape).map(([key, field]) => {
        const { schema: current, optional } = unwrapZod(field);
        return `"${key}": ${describeZodType(current)}${optional ? " (optional)" : ""}`;
      });
      return `object { ${fields.join("; ")} }`;
    }
    default:
      return "string";
  }
}

function unwrapZod(schema: z.ZodTypeAny): { schema: z.ZodTypeAny; optional: boolean } {
  let current = schema;
  let optional = false;
  for (let guard = 0; guard < 8; guard += 1) {
    const typeName = getZodDef(current)?.typeName;
    if (typeName === "ZodOptional" || typeName === "ZodNullable" || typeName === "ZodDefault") {
      if (typeName === "ZodOptional") optional = true;
      current = (current as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
      continue;
    }
    break;
  }
  return { schema: current, optional };
}

function getZodDef(schema: z.ZodTypeAny): { typeName?: string } | undefined {
  return (schema as { _def?: { typeName?: string } })._def;
}

function getObjectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | undefined {
  const directShape = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (directShape) return directShape;

  const defShape = (schema as unknown as { _def?: { shape?: (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny> } })._def?.shape;
  if (typeof defShape === "function") return defShape();
  return defShape;
}

/**
 * Models sometimes wrap JSON in markdown fences (```json ... ```) or add a
 * sentence of prose. Strip fences and, failing that, grab the outermost JSON
 * object/array so JSON.parse doesn't choke.
 */
function extractJson(text: string): string {
  let t = text.trim();

  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    t = fenced[1].trim();
  }

  if (!t.startsWith("{") && !t.startsWith("[")) {
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      t = t.slice(start, end + 1);
    }
  }

  return t;
}

export function hasClaudeKey() {
  return Boolean(client);
}

// ---------------------------------------------------------------------------
// Tool-using conversation loop — powers the outbound agent the boss chats with.
// Unlike callClaudeJson (single-shot), this runs the Messages API agentic loop:
// call -> if the model requests tools, run them, feed results back, repeat
// until the model produces a final text answer.
// ---------------------------------------------------------------------------

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  run: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationResult {
  text: string;
  toolCalls: string[];
}

export async function runClaudeConversation(input: {
  model?: "fast" | "strong";
  system: string;
  history: ConversationTurn[];
  tools: AgentTool[];
  maxTokens?: number;
  maxToolIterations?: number;
}): Promise<ConversationResult> {
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const model = input.model === "fast" ? env.CLAUDE_FAST_MODEL : env.CLAUDE_STRONG_MODEL;
  const toolDefs: Anthropic.Tool[] = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));

  const messages: Anthropic.MessageParam[] = input.history.map((turn) => ({
    role: turn.role,
    content: turn.content
  }));
  const toolCalls: string[] = [];
  const maxIterations = input.maxToolIterations ?? 8;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: input.maxTokens ?? 1500,
      thinking: { type: "disabled" },
      system: input.system,
      tools: toolDefs,
      messages
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { text, toolCalls };
    }

    // Preserve the assistant turn verbatim (required so tool_result blocks line up).
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolCalls.push(block.name);
      const tool = toolsByName.get(block.name);
      try {
        if (!tool) {
          throw new Error(`Unknown tool: ${block.name}`);
        }
        const result = await tool.run((block.input ?? {}) as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result ?? null)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${message}`,
          is_error: true
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    text: "I couldn't finish that lookup within the step limit. Try narrowing the question.",
    toolCalls
  };
}
