import { classifyReply } from "../agents/replyIntentAgent.js";
import { draftReply } from "../agents/draftingAgent.js";
import { markEventProcessed } from "../db/events.js";
import { saveDraft, saveReplyClassification } from "../db/replyRecords.js";
import { saveSuppression } from "../db/suppressions.js";
import { upsertReplyContext } from "../integrations/hubspot.js";
import { stopLeadSequence, suppressLead } from "../integrations/instantly.js";
import { postHotReply, postError } from "../integrations/slack.js";
import type { QueueJob } from "../queue/queue.js";
import type { InstantlyEvent } from "../types/domain.js";

interface InstantlyEventJobPayload {
  eventId: string;
  event: InstantlyEvent;
}

export async function processInstantlyEventJob(job: QueueJob) {
  const { eventId, event } = job.payload as InstantlyEventJobPayload;

  if (isBounce(event)) {
    await saveSuppression({
      email: event.email,
      provider: event.provider,
      providerLeadId: event.leadId,
      reason: "bounce",
      rawPayload: event.raw
    });
    await suppressLead({ email: event.email, leadId: event.leadId, reason: "bounce" });
    await markEventProcessed(eventId);
    return;
  }

  if (!isReply(event)) {
    await markEventProcessed(eventId);
    return;
  }

  const threadText = event.threadText ?? "";
  const classification = await classifyReply({
    companyName: event.companyName,
    email: event.email,
    threadText
  });

  const replyClassificationId = await saveReplyClassification({
    eventId,
    email: event.email,
    companyName: event.companyName,
    classification,
    rawThread: threadText
  });

  const shouldDraft = ["positive", "question", "objection"].includes(classification.intent);
  const draft = shouldDraft
    ? await draftReply({
        companyName: event.companyName,
        email: event.email,
        threadText,
        classification
      })
    : undefined;

  if (draft) {
    await saveDraft({
      replyClassificationId,
      draft
    });
  }

  await upsertReplyContext({
    email: event.email,
    companyName: event.companyName,
    classification,
    draft,
    rawThread: threadText
  });

  if (classification.intent === "unsubscribe" || classification.intent === "negative") {
    await saveSuppression({
      email: event.email,
      provider: event.provider,
      providerLeadId: event.leadId,
      reason: classification.intent,
      rawPayload: event.raw
    });
    await suppressLead({
      email: event.email,
      leadId: event.leadId,
      reason: classification.intent
    });
  }

  if (classification.intent === "positive" || classification.intent === "question" || classification.intent === "objection") {
    await stopLeadSequence({ email: event.email, leadId: event.leadId });
    await postHotReply(formatHotReply(event.companyName, classification.intent, classification.reason, draft?.body));
  }

  if (classification.intent === "unclear") {
    await postError(`Unclear reply intent for ${event.companyName ?? event.email ?? "unknown lead"}; needs human review.`);
  }

  await markEventProcessed(eventId);
}

function isReply(event: InstantlyEvent) {
  return /reply|replied|email_reply/i.test(event.eventType);
}

function isBounce(event: InstantlyEvent) {
  return /bounce|bounced/i.test(event.eventType);
}

function formatHotReply(companyName: string | undefined, intent: string, reason: string, draft?: string) {
  return [
    `Hot reply: ${companyName ?? "Unknown company"}`,
    `Intent: ${intent}`,
    `Reason: ${reason}`,
    draft ? `Draft:\n${draft}` : undefined
  ]
    .filter(Boolean)
    .join("\n\n");
}
