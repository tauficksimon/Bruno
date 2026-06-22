import { pool } from "./pool.js";
import type { DraftedReply, ReplyClassification } from "../types/domain.js";

export async function saveReplyClassification(input: {
  eventId: string;
  email?: string;
  companyName?: string;
  classification: ReplyClassification;
  rawThread?: string;
}) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO reply_classifications (
        event_id,
        email,
        company_name,
        intent,
        confidence,
        reason,
        suggested_next_action,
        raw_thread
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      input.eventId,
      input.email,
      input.companyName,
      input.classification.intent,
      input.classification.confidence,
      input.classification.reason,
      input.classification.suggestedNextAction,
      input.rawThread
    ]
  );

  return result.rows[0].id;
}

export async function saveDraft(input: {
  replyClassificationId: string;
  draft: DraftedReply;
}) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO drafts (
        reply_classification_id,
        subject,
        body,
        internal_reason
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [
      input.replyClassificationId,
      input.draft.subject,
      input.draft.body,
      input.draft.internalReason
    ]
  );

  return result.rows[0].id;
}
