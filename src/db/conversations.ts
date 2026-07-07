import { pool } from "./pool.js";
import type { ConversationTurn } from "../integrations/claude.js";

/**
 * Append one turn to a conversation thread (Slack channel+thread, or DM).
 */
export async function appendConversationTurn(
  threadKey: string,
  role: "user" | "assistant",
  content: string
) {
  await pool.query(
    `INSERT INTO agent_conversations (thread_key, role, content) VALUES ($1, $2, $3)`,
    [threadKey, role, content]
  );
}

export async function appendConversationTurnIfLatestDiffers(
  threadKey: string,
  role: "user" | "assistant",
  content: string
) {
  const latest = await pool.query<{ role: "user" | "assistant"; content: string }>(
    `
      SELECT role, content
      FROM agent_conversations
      WHERE thread_key = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [threadKey]
  );

  const last = latest.rows[0];
  if (last?.role === role && last.content === content) return false;

  await appendConversationTurn(threadKey, role, content);
  return true;
}

/**
 * Load the most recent turns for a thread, oldest-first, for use as agent history.
 */
export async function loadConversation(threadKey: string, limit = 20): Promise<ConversationTurn[]> {
  const result = await pool.query<{ role: "user" | "assistant"; content: string }>(
    `
      SELECT role, content
      FROM (
        SELECT role, content, created_at
        FROM agent_conversations
        WHERE thread_key = $1
        ORDER BY created_at DESC
        LIMIT $2
      ) recent
      ORDER BY created_at ASC
    `,
    [threadKey, limit]
  );

  const turns = result.rows.map((row) => ({ role: row.role, content: row.content }));
  while (turns[0]?.role === "assistant") {
    turns.shift();
  }
  return turns;
}
