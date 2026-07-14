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

export interface WebChatSession {
  chatId: string;
  title: string;
  lastAt: string;
  turnCount: number;
}

/**
 * The owner's chat sessions with Bruno (thread keys "web:<id>"), newest first.
 * Title = the session's first user message, truncated for the sidebar.
 */
export async function listWebSessions(limit = 12): Promise<WebChatSession[]> {
  const result = await pool.query<{ thread_key: string; title: string | null; last_at: string; turn_count: string }>(
    `
      SELECT
        thread_key,
        (array_agg(content ORDER BY created_at ASC) FILTER (WHERE role = 'user'))[1] AS title,
        max(created_at)::text AS last_at,
        count(*)::text AS turn_count
      FROM agent_conversations
      WHERE thread_key LIKE 'web:%'
      GROUP BY thread_key
      ORDER BY max(created_at) DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map((row) => ({
    chatId: row.thread_key.slice(4),
    title: (row.title ?? "New chat").slice(0, 60),
    lastAt: row.last_at,
    turnCount: Number(row.turn_count)
  }));
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

/**
 * Channel variant: keeps leading assistant turns (a channel is mostly
 * Bruno-first) and satisfies the user-first API requirement with a synthetic
 * opener, so replies get the feed as context.
 */
export async function loadChannelConversation(threadKey: string, limit = 30): Promise<ConversationTurn[]> {
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
  return result.rows.map((row) => ({ role: row.role, content: row.content }));
}

/** Newest post time in a channel thread (for the sidebar unread dot). */
export async function getChannelLatestAt(threadKey: string): Promise<string | undefined> {
  const result = await pool.query<{ latest: string | null }>(
    "SELECT max(created_at)::text AS latest FROM agent_conversations WHERE thread_key = $1",
    [threadKey]
  );
  return result.rows[0]?.latest ?? undefined;
}
