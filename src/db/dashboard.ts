import { pool } from "./pool.js";

export interface PendingDraftRow {
  id: string;
  status: string;
  subject: string | null;
  body: string;
  internal_reason: string | null;
  created_at: string;
  intent: string;
  confidence: number;
  reason: string;
  email: string | null;
  company_name: string | null;
  raw_thread: string | null;
  event_payload: unknown;
}

const draftWithContextSelect = `
  SELECT
    d.id,
    d.status,
    d.subject,
    d.body,
    d.internal_reason,
    d.created_at::text,
    rc.intent,
    rc.confidence::float AS confidence,
    rc.reason,
    rc.email,
    rc.company_name,
    rc.raw_thread,
    e.payload AS event_payload
  FROM drafts d
  JOIN reply_classifications rc ON rc.id = d.reply_classification_id
  LEFT JOIN events e ON e.id = rc.event_id
`;

export async function listPendingDrafts(limit = 20): Promise<PendingDraftRow[]> {
  const result = await pool.query<PendingDraftRow>(
    `${draftWithContextSelect} WHERE d.status = 'drafted' ORDER BY d.created_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getDraftWithContext(id: string): Promise<PendingDraftRow | undefined> {
  const result = await pool.query<PendingDraftRow>(`${draftWithContextSelect} WHERE d.id = $1`, [id]);
  return result.rows[0];
}

/**
 * Atomically claim a pending draft for sending. Only one caller can move a
 * draft out of 'drafted', so a double-clicked Approve button cannot double-send.
 */
export async function claimDraftForSend(id: string, finalSubject: string | null, finalBody: string) {
  const result = await pool.query<{ id: string }>(
    `
      UPDATE drafts
      SET status = 'approved', subject = $2, body = $3, updated_at = now()
      WHERE id = $1 AND status = 'drafted'
      RETURNING id
    `,
    [id, finalSubject, finalBody]
  );
  return result.rowCount === 1;
}

export async function markDraftSent(id: string) {
  await pool.query("UPDATE drafts SET status = 'sent', updated_at = now() WHERE id = $1", [id]);
}

/** Put a claimed draft back in the approval queue after a failed send. */
export async function releaseDraftClaim(id: string) {
  await pool.query("UPDATE drafts SET status = 'drafted', updated_at = now() WHERE id = $1 AND status = 'approved'", [id]);
}

export async function rejectDraft(id: string) {
  const result = await pool.query<{ id: string }>(
    "UPDATE drafts SET status = 'rejected', updated_at = now() WHERE id = $1 AND status = 'drafted' RETURNING id",
    [id]
  );
  return result.rowCount === 1;
}

export async function recordApproval(input: {
  draftId: string;
  action: "approved" | "edited" | "rejected";
  actor?: string;
  notes?: string;
}) {
  await pool.query("INSERT INTO approvals (draft_id, action, actor, notes) VALUES ($1, $2, $3, $4)", [
    input.draftId,
    input.action,
    input.actor ?? "dashboard",
    input.notes ?? null
  ]);
}

export interface ReplyFeedRow {
  id: string;
  intent: string;
  confidence: number;
  reason: string;
  email: string | null;
  company_name: string | null;
  created_at: string;
  draft_status: string | null;
}

export async function listRecentClassifications(limit = 30): Promise<ReplyFeedRow[]> {
  const result = await pool.query<ReplyFeedRow>(
    `
      SELECT
        rc.id,
        rc.intent,
        rc.confidence::float AS confidence,
        rc.reason,
        rc.email,
        rc.company_name,
        rc.created_at::text,
        d.status AS draft_status
      FROM reply_classifications rc
      LEFT JOIN drafts d ON d.reply_classification_id = rc.id
      ORDER BY rc.created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

export interface ApprovalLogRow {
  action: string;
  actor: string | null;
  notes: string | null;
  created_at: string;
  company_name: string | null;
  email: string | null;
  intent: string | null;
}

export async function listRecentApprovals(limit = 15): Promise<ApprovalLogRow[]> {
  const result = await pool.query<ApprovalLogRow>(
    `
      SELECT
        a.action,
        a.actor,
        a.notes,
        a.created_at::text,
        rc.company_name,
        rc.email,
        rc.intent
      FROM approvals a
      LEFT JOIN drafts d ON d.id = a.draft_id
      LEFT JOIN reply_classifications rc ON rc.id = d.reply_classification_id
      ORDER BY a.created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}
