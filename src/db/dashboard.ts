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
  suggested_next_action: string | null;
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
    rc.suggested_next_action,
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
 * Bruno's original subject/body are left untouched — the human's final version
 * lives on the approvals row (the edit diff is the Phase C learning signal).
 */
export async function claimDraftForSend(id: string) {
  const result = await pool.query<{ id: string }>(
    "UPDATE drafts SET status = 'approved', updated_at = now() WHERE id = $1 AND status = 'drafted' RETURNING id",
    [id]
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
  finalSubject?: string;
  finalBody?: string;
}) {
  await pool.query(
    "INSERT INTO approvals (draft_id, action, actor, notes, final_subject, final_body) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      input.draftId,
      input.action,
      input.actor ?? "dashboard",
      input.notes ?? null,
      input.finalSubject ?? null,
      input.finalBody ?? null
    ]
  );
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
  raw_thread: string | null;
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
        d.status AS draft_status,
        rc.raw_thread
      FROM reply_classifications rc
      LEFT JOIN drafts d ON d.reply_classification_id = rc.id
      ORDER BY rc.created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

/** New replies in the last N hours, grouped by intent — the briefing's raw material. */
export async function getRecentReplySummary(hours: number) {
  const result = await pool.query<{ intent: string; count: string; latest_company: string | null }>(
    `
      SELECT intent, count(*)::text AS count,
             (array_agg(coalesce(company_name, email) ORDER BY created_at DESC))[1] AS latest_company
      FROM reply_classifications
      WHERE created_at >= now() - ($1::text || ' hours')::interval
      GROUP BY intent
    `,
    [hours]
  );
  return result.rows.map((row) => ({
    intent: row.intent,
    count: Number(row.count),
    latestCompany: row.latest_company ?? undefined
  }));
}

// ————— Lead dossier (Postgres half) —————

export interface LeadClassificationRow {
  id: string;
  intent: string;
  confidence: number;
  reason: string;
  suggested_next_action: string | null;
  raw_thread: string | null;
  created_at: string;
  draft_id: string | null;
  draft_status: string | null;
  draft_subject: string | null;
  draft_body: string | null;
}

export interface LeadApprovalRow {
  action: string;
  notes: string | null;
  final_subject: string | null;
  final_body: string | null;
  created_at: string;
  draft_id: string | null;
}

export interface LeadSuppressionRow {
  reason: string;
  created_at: string;
}

export async function getLeadActivity(email: string) {
  const [classifications, approvals, suppressions] = await Promise.all([
    pool.query<LeadClassificationRow>(
      `
        SELECT rc.id, rc.intent, rc.confidence::float AS confidence, rc.reason,
               rc.suggested_next_action, rc.raw_thread, rc.created_at::text,
               d.id AS draft_id, d.status AS draft_status, d.subject AS draft_subject, d.body AS draft_body
        FROM reply_classifications rc
        LEFT JOIN drafts d ON d.reply_classification_id = rc.id
        WHERE lower(rc.email) = lower($1)
        ORDER BY rc.created_at ASC
      `,
      [email]
    ),
    pool.query<LeadApprovalRow>(
      `
        SELECT a.action, a.notes, a.final_subject, a.final_body, a.created_at::text, a.draft_id
        FROM approvals a
        JOIN drafts d ON d.id = a.draft_id
        JOIN reply_classifications rc ON rc.id = d.reply_classification_id
        WHERE lower(rc.email) = lower($1)
        ORDER BY a.created_at ASC
      `,
      [email]
    ),
    pool.query<LeadSuppressionRow>(
      "SELECT reason, created_at::text FROM suppression_events WHERE lower(email) = lower($1) ORDER BY created_at ASC",
      [email]
    )
  ]);
  return { classifications: classifications.rows, approvals: approvals.rows, suppressions: suppressions.rows };
}

export interface LocalSearchRow {
  email: string;
  company_name: string | null;
  last_intent: string | null;
  last_at: string;
  pending_draft: boolean;
}

/** Search Bruno's own records by email/company fragment. */
export async function searchLeadsLocal(q: string, limit = 12): Promise<LocalSearchRow[]> {
  const result = await pool.query<LocalSearchRow>(
    `
      SELECT
        lower(rc.email) AS email,
        (array_agg(rc.company_name ORDER BY rc.created_at DESC))[1] AS company_name,
        (array_agg(rc.intent ORDER BY rc.created_at DESC))[1] AS last_intent,
        max(rc.created_at)::text AS last_at,
        bool_or(d.status = 'drafted') AS pending_draft
      FROM reply_classifications rc
      LEFT JOIN drafts d ON d.reply_classification_id = rc.id
      WHERE rc.email IS NOT NULL
        AND (rc.email ILIKE '%' || $1 || '%' OR rc.company_name ILIKE '%' || $1 || '%')
      GROUP BY lower(rc.email)
      ORDER BY max(rc.created_at) DESC
      LIMIT $2
    `,
    [q, limit]
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
