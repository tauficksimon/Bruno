import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env, isProduction } from "../config/env.js";
import { isAgentPaused, setAgentPaused } from "../db/config.js";
import {
  claimDraftForSend,
  getDraftWithContext,
  listPendingDrafts,
  listRecentApprovals,
  listRecentClassifications,
  markDraftSent,
  recordApproval,
  rejectDraft,
  releaseDraftClaim,
  type PendingDraftRow
} from "../db/dashboard.js";
import { getIntentCountsSince, getPendingDraftCount, getQueueSummary, listRecentDailyMetrics } from "../db/metrics.js";
import { sendReplyEmail } from "../integrations/instantly.js";
import { renderDashboardPage, renderMessagePage, type DashboardData, type DraftCardModel } from "./render.js";

const COOKIE_NAME = "bruno_dash";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

function secretMatches(candidate: string) {
  if (!env.DASHBOARD_SECRET || !candidate) return false;
  // Hash both sides so timingSafeEqual never sees mismatched lengths.
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(env.DASHBOARD_SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}

function readAuthCookie(request: FastifyRequest) {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function isAuthorized(request: FastifyRequest) {
  const cookie = readAuthCookie(request);
  return cookie !== undefined && secretMatches(cookie);
}

function setAuthCookie(reply: FastifyReply, value: string) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/dashboard",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`
  ];
  if (isProduction) attributes.push("Secure");
  reply.header("set-cookie", attributes.join("; "));
}

/**
 * Pull the Instantly identifiers a reply-send needs out of the stored event
 * payload (shape produced by processReplyPoll → normalizeInstantlyEvent).
 */
function extractSendContext(payload: unknown) {
  const record = (payload ?? {}) as Record<string, unknown>;
  const data = (record.data ?? {}) as Record<string, unknown>;
  const pick = (key: string) => {
    const nested = data[key];
    if (typeof nested === "string" && nested) return nested;
    const top = record[key];
    if (typeof top === "string" && top) return top;
    return undefined;
  };

  const replyToUuid = pick("id");
  const eaccount = pick("eaccount");
  const originalSubject = pick("subject");
  return { replyToUuid, eaccount, originalSubject };
}

function defaultSubject(draftSubject: string | null, originalSubject?: string) {
  if (draftSubject?.trim()) return draftSubject.trim();
  if (originalSubject?.trim()) {
    const original = originalSubject.trim();
    return /^re:/i.test(original) ? original : `Re: ${original}`;
  }
  return "Re: your reply";
}

function toDraftCard(row: PendingDraftRow): DraftCardModel {
  const context = extractSendContext(row.event_payload);
  return {
    id: row.id,
    companyName: row.company_name ?? undefined,
    email: row.email ?? undefined,
    intent: row.intent,
    confidence: row.confidence,
    reason: row.reason,
    internalReason: row.internal_reason ?? undefined,
    prospectText: row.raw_thread ?? undefined,
    subject: defaultSubject(row.subject, context.originalSubject),
    body: row.body,
    createdAt: row.created_at,
    sendFrom: context.eaccount,
    canSend: Boolean(context.replyToUuid && context.eaccount)
  };
}

async function loadDashboardData(): Promise<DashboardData> {
  const [agentPaused, dailyRows, intentCounts, pendingCount, queue, drafts, feed, activity] = await Promise.all([
    isAgentPaused(),
    listRecentDailyMetrics(7),
    getIntentCountsSince(7 * 24),
    getPendingDraftCount(),
    getQueueSummary(),
    listPendingDrafts(20),
    listRecentClassifications(20),
    listRecentApprovals(12)
  ]);

  // metrics_daily has one row per (date, campaign); collapse to one row per date.
  const byDate = new Map<string, { date: string; sends: number; replies: number; bounces: number }>();
  for (const row of dailyRows) {
    const day = byDate.get(row.metric_date) ?? { date: row.metric_date, sends: 0, replies: 0, bounces: 0 };
    day.sends += row.sends;
    day.replies += row.replies;
    day.bounces += row.bounces;
    byDate.set(row.metric_date, day);
  }
  const daily = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));

  return {
    agentPaused,
    sends7d: daily.reduce((sum, day) => sum + day.sends, 0),
    replies7d: daily.reduce((sum, day) => sum + day.replies, 0),
    bounces7d: daily.reduce((sum, day) => sum + day.bounces, 0),
    pendingCount,
    failedJobs: queue.failed ?? 0,
    intentCounts,
    daily,
    drafts: drafts.map(toDraftCard),
    feed: feed.map((row) => ({
      companyName: row.company_name ?? undefined,
      email: row.email ?? undefined,
      intent: row.intent,
      confidence: row.confidence,
      reason: row.reason,
      createdAt: row.created_at,
      draftStatus: row.draft_status ?? undefined
    })),
    activity: activity.map((row) => ({
      action: row.action,
      companyName: row.company_name ?? undefined,
      email: row.email ?? undefined,
      intent: row.intent ?? undefined,
      createdAt: row.created_at
    })),
    generatedAt: new Date()
  };
}

const approveBodySchema = z.object({
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(20000)
});

export async function registerDashboard(app: FastifyInstance) {
  app.get("/dashboard", async (request, reply) => {
    if (!env.DASHBOARD_SECRET) {
      return reply
        .code(503)
        .type("text/html")
        .send(
          renderMessagePage(
            "Dashboard not configured",
            "Set the DASHBOARD_SECRET environment variable to enable the dashboard.",
            "503 · service unavailable"
          )
        );
    }

    const key = (request.query as Record<string, unknown>)?.key;
    if (typeof key === "string" && secretMatches(key)) {
      setAuthCookie(reply, key);
      return reply.redirect("/dashboard", 302);
    }

    if (!isAuthorized(request)) {
      return reply
        .code(401)
        .type("text/html")
        .send(
          renderMessagePage(
            "Access required",
            "Open the dashboard through the private link you were given. If the link stopped working, ask for a fresh one.",
            "401 · not signed in"
          )
        );
    }

    const data = await loadDashboardData();
    return reply.type("text/html").send(renderDashboardPage(data));
  });

  app.post("/dashboard/api/drafts/:id/approve", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });

    const { id } = request.params as { id: string };
    const parsed = approveBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "reply body is required" });

    const draft = await getDraftWithContext(id);
    if (!draft) return reply.code(404).send({ error: "draft not found" });
    if (draft.status !== "drafted") return reply.code(409).send({ error: `draft is already ${draft.status}` });

    const context = extractSendContext(draft.event_payload);
    if (!context.replyToUuid || !context.eaccount) {
      return reply.code(422).send({ error: "missing Instantly message reference — send manually from Instantly" });
    }

    const finalSubject = defaultSubject(parsed.data.subject ?? null, context.originalSubject);
    const finalBody = parsed.data.body.trim();
    const edited = finalBody !== draft.body.trim() || finalSubject !== defaultSubject(draft.subject, context.originalSubject);

    const claimed = await claimDraftForSend(id, finalSubject, finalBody);
    if (!claimed) return reply.code(409).send({ error: "draft was already handled" });

    try {
      await sendReplyEmail({
        replyToUuid: context.replyToUuid,
        eaccount: context.eaccount,
        subject: finalSubject,
        bodyText: finalBody
      });
    } catch (error) {
      await releaseDraftClaim(id);
      request.log.error({ err: error, draftId: id }, "dashboard approve: Instantly send failed");
      return reply.code(502).send({ error: "Instantly rejected the send — draft returned to the queue" });
    }

    await markDraftSent(id);
    await recordApproval({ draftId: id, action: edited ? "edited" : "approved", notes: edited ? "edited on dashboard before send" : undefined });
    return reply.send({ ok: true });
  });

  app.post("/dashboard/api/drafts/:id/reject", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });

    const { id } = request.params as { id: string };
    const rejected = await rejectDraft(id);
    if (!rejected) return reply.code(409).send({ error: "draft was already handled" });

    await recordApproval({ draftId: id, action: "rejected" });
    return reply.send({ ok: true });
  });

  app.post("/dashboard/api/agent/pause", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });

    const parsed = z.object({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "paused flag is required" });

    await setAgentPaused(parsed.data.paused);
    return reply.send({ ok: true, paused: parsed.data.paused });
  });
}
