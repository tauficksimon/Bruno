import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { runOutboundAgent } from "../agents/outboundAgent.js";
import { env, isProduction } from "../config/env.js";
import { getConfigValue, isAgentPaused, setAgentPaused } from "../db/config.js";
import {
  appendConversationTurn,
  getChannelLatestAt,
  listWebSessions,
  loadChannelConversation,
  loadConversation,
  type WebChatSession
} from "../db/conversations.js";
import {
  claimDraftForSend,
  getDraftWithContext,
  getLeadActivity,
  getRecentReplySummary,
  listPendingDrafts,
  listRecentApprovals,
  listRecentClassifications,
  markDraftSent,
  recordApproval,
  rejectDraft,
  releaseDraftClaim,
  searchLeadsLocal,
  type PendingDraftRow
} from "../db/dashboard.js";
import {
  getIntentCountsSince,
  getOldestQueuedJobAgeMinutes,
  getPendingDraftCount,
  getQueueSummary,
  listRecentDailyMetrics
} from "../db/metrics.js";
import { cachedFetch, deleteCachedValue } from "../db/cache.js";
import { clearFailedJobs, getFailedJobGroups, retryLatestFailedJob } from "../db/ops.js";
import { hasClaudeKey } from "../integrations/claude.js";
import { UPDATES_THREAD_KEY } from "../integrations/notify.js";
import {
  countCampaignLeads,
  getCampaignAnalyticsOverview,
  getInstantlyCampaign,
  getLeadEngagement,
  getLeadRecord,
  getWarmupAnalytics,
  interestStatusLabel,
  leadStatusLabel,
  listInstantlyCampaigns,
  listLeadEmails,
  listLeadRecordsPage,
  sendReplyEmail,
  setLeadInterest,
  type InstantlyLeadEngagement,
  type InstantlyLeadRecord,
  type LeadEmailItem
} from "../integrations/instantly.js";
import {
  renderBrunoPage,
  renderCampaignPage,
  renderInboxPage,
  renderLeadPage,
  renderLeadsPage,
  renderSearchPage,
  renderSystemPage,
  type CrmRow,
  type DraftCardModel,
  type ReplyFeedModel,
  type SearchResultRow,
  type TimelineItem
} from "./pages.js";
import { renderMessagePage, renderShell, type ShellContext } from "./ui.js";

const COOKIE_NAME = "bruno_dash";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days
const CHAT_ID_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

function threadKeyFor(chatId: string) {
  // "updates" is the reserved id for Bruno's proactive channel.
  return chatId === "updates" ? UPDATES_THREAD_KEY : `web:${chatId}`;
}

function modelLabel() {
  return env.CLAUDE_STRONG_MODEL
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace(/(\d)-(\d)/g, "$1.$2")
    .replace(/-/g, " ");
}

// ————— Auth —————

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
 * Shared gate for the HTML pages: handles the ?key= login link (works on any
 * page path), the not-configured case, and the 401 page. Returns true when the
 * request may proceed.
 */
function authorizePage(request: FastifyRequest, reply: FastifyReply, path: string): boolean {
  if (!env.DASHBOARD_SECRET) {
    void reply
      .code(503)
      .type("text/html")
      .send(
        renderMessagePage(
          "Dashboard not configured",
          "Set the DASHBOARD_SECRET environment variable to enable the dashboard.",
          "503 · service unavailable"
        )
      );
    return false;
  }

  const key = (request.query as Record<string, unknown>)?.key;
  if (typeof key === "string" && secretMatches(key)) {
    setAuthCookie(reply, key);
    // Preserve the rest of the query string (e.g. ?email=… on the dossier).
    const url = new URL(request.url, "http://local");
    url.searchParams.delete("key");
    void reply.redirect(`${path}${url.search}`, 302);
    return false;
  }

  if (!isAuthorized(request)) {
    void reply
      .code(401)
      .type("text/html")
      .send(
        renderMessagePage(
          "Access required",
          "Open the console through the private link you were given. If the link stopped working, ask for a fresh one.",
          "401 · not signed in"
        )
      );
    return false;
  }

  return true;
}

// ————— Shared shell data —————

async function loadShellContext(
  active: ShellContext["active"],
  title: string,
  autoRefresh: boolean,
  options: { activeChatId?: string; sessions?: WebChatSession[] } = {}
): Promise<ShellContext> {
  const sessions = options.sessions ?? (await listWebSessions(12));
  const dockChatId = sessions[0]?.chatId ?? "console";
  const [agentPaused, pendingCount, queue, dockTurns, updatesLatestAt] = await Promise.all([
    isAgentPaused(),
    getPendingDraftCount(),
    getQueueSummary(),
    active === "bruno" ? Promise.resolve(undefined) : loadConversation(threadKeyFor(dockChatId), 8),
    getChannelLatestAt(UPDATES_THREAD_KEY)
  ]);

  return {
    active,
    title,
    pendingCount,
    failedJobs: queue.failed ?? 0,
    agentPaused,
    generatedAt: new Date(),
    autoRefresh,
    dockTurns,
    sessions: sessions.map((s) => ({ chatId: s.chatId, title: s.title, lastAt: s.lastAt })),
    activeChatId: options.activeChatId,
    dockChatId,
    updatesLatestAt
  };
}

// ————— Draft helpers —————

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

  return {
    replyToUuid: pick("id"),
    eaccount: pick("eaccount"),
    originalSubject: pick("subject")
  };
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
    canSend: Boolean(context.replyToUuid && context.eaccount),
    suggestedNextAction: row.suggested_next_action ?? undefined
  };
}

const approveBodySchema = z.object({
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(20000)
});

// ————— Routes —————

/** Minutes since an ISO timestamp; undefined if missing/unparseable. */
function minutesSince(iso: string | undefined) {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return undefined;
  return Math.max(0, Math.floor((Date.now() - then) / 60000));
}

function agoLabel(minutes: number | undefined) {
  if (minutes === undefined) return undefined;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const HOT_INTENTS = ["positive", "question", "objection"];
const HANDLED_INTENTS = ["not_now", "negative", "unsubscribe"];

// ————— Live Instantly layer (cached, failure-tolerant) —————

export interface CampaignPulse {
  campaignId: string;
  campaignName: string;
  statusLabel: string;
  dailyLimit?: number;
  openTracking?: boolean;
  leadCount?: number;
  leadCountCapped?: boolean;
  sent: number;
  opensUnique: number;
  clicks: number;
  repliesUnique: number;
  bounces: number;
  unsubscribes: number;
  inboxes: Array<{ email: string; todaySent?: number; last7Sent: number; landingRate: number }>;
}

function campaignStatusLabel(status?: number) {
  switch (status) {
    case 0: return "draft";
    case 1: return "active";
    case 2: return "paused";
    case 3: return "completed";
    case 4: return "running";
    default: return "unknown";
  }
}

/**
 * One shared snapshot of the live Instantly state, cached 5 minutes. Returns
 * null when Instantly is unreachable — pages render without the live layer
 * instead of failing.
 */
async function loadCampaignPulse(): Promise<CampaignPulse | null> {
  try {
    return await cachedFetch<CampaignPulse | null>("instantly:pulse", 300, async () => {
      const campaigns = await listInstantlyCampaigns({ limit: 10 });
      const campaign = campaigns[0];
      if (!campaign) return null;

      const [detail, analytics, leadCount, warmup] = await Promise.allSettled([
        getInstantlyCampaign(campaign.id),
        getCampaignAnalyticsOverview(campaign.id),
        countCampaignLeads({ campaignId: campaign.id, maxPages: 3 }),
        (async () => {
          const emails = campaign.email_list ?? [];
          return emails.length > 0 ? getWarmupAnalytics(emails) : [];
        })()
      ]);

      const detailRecord = detail.status === "fulfilled" ? (detail.value as unknown as Record<string, unknown>) : {};
      const a = analytics.status === "fulfilled" ? analytics.value : undefined;

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        statusLabel: campaignStatusLabel(campaign.status),
        dailyLimit: typeof detailRecord.daily_limit === "number" ? detailRecord.daily_limit : undefined,
        openTracking: typeof detailRecord.open_tracking === "boolean" ? detailRecord.open_tracking : undefined,
        leadCount: leadCount.status === "fulfilled" ? leadCount.value.count : undefined,
        leadCountCapped: leadCount.status === "fulfilled" ? leadCount.value.capped : undefined,
        sent: a?.emails_sent_count ?? 0,
        opensUnique: a?.open_count_unique ?? 0,
        clicks: a?.link_click_count ?? 0,
        repliesUnique: a?.reply_count_unique ?? 0,
        bounces: a?.bounced_count ?? 0,
        unsubscribes: a?.unsubscribed_count ?? 0,
        inboxes:
          warmup.status === "fulfilled"
            ? warmup.value.map((w) => ({
                email: w.email,
                todaySent: w.today?.sent,
                last7Sent: w.last7DaysSent,
                landingRate: w.inboxLandingRate
              }))
            : []
      };
    });
  } catch {
    return null;
  }
}

/** Per-lead engagement for the people shown in the Inbox (cached 15 min each). */
async function loadEngagementMap(emails: Array<string | undefined>, campaignId?: string) {
  const unique = [...new Set(emails.filter((e): e is string => Boolean(e)))].slice(0, 12);
  const results = await Promise.allSettled(
    unique.map((email) =>
      cachedFetch<InstantlyLeadEngagement | null>(`lead-eng:${email.toLowerCase()}`, 900, async () => {
        return (await getLeadEngagement({ email, campaignId })) ?? null;
      })
    )
  );
  const map = new Map<string, InstantlyLeadEngagement>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) map.set(unique[index].toLowerCase(), result.value);
  });
  return map;
}

function toFeedModel(row: { company_name: string | null; email: string | null; intent: string; reason: string; created_at: string; raw_thread: string | null }): ReplyFeedModel {
  return {
    companyName: row.company_name ?? undefined,
    email: row.email ?? undefined,
    intent: row.intent,
    reason: row.reason,
    createdAt: row.created_at,
    prospectText: row.raw_thread ?? undefined
  };
}

export async function registerDashboard(app: FastifyInstance) {
  // Old paths → new homes (bookmarks and older links keep working)
  for (const [from, to] of [
    ["/dashboard/approvals", "/dashboard/inbox"],
    ["/dashboard/replies", "/dashboard/inbox"],
    ["/dashboard/metrics", "/dashboard/campaign"],
    ["/dashboard/ops", "/dashboard/system"]
  ] as const) {
    app.get(from, async (_request, reply) => reply.redirect(to, 301));
  }

  // New chat session
  app.get("/dashboard/new", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/new")) return reply;
    return reply.redirect(`/dashboard?chat=${crypto.randomUUID()}`, 302);
  });

  // Bruno — briefing + chat home
  app.get("/dashboard", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard")) return reply;

    const sessions = await listWebSessions(12);
    const requested = (request.query as Record<string, unknown>)?.chat;
    // No ?chat → a fresh conversation every time; history lives in the sidebar.
    const chatId =
      typeof requested === "string" && CHAT_ID_PATTERN.test(requested) ? requested : crypto.randomUUID();

    const isChannel = chatId === "updates";
    const [shell, turns, drafts, replies24h, dailyRows, lastPollAt, pulse] = await Promise.all([
      loadShellContext("bruno", isChannel ? "# updates" : "Bruno", false, { activeChatId: chatId, sessions }),
      isChannel ? loadChannelConversation(threadKeyFor(chatId), 60) : loadConversation(threadKeyFor(chatId), 40),
      listPendingDrafts(20),
      getRecentReplySummary(24),
      listRecentDailyMetrics(2),
      getConfigValue<string>("last_poll_success_at"),
      loadCampaignPulse()
    ]);

    const hottest = drafts
      .slice()
      .sort(
        (a, b) =>
          HOT_INTENTS.indexOf(a.intent) - HOT_INTENTS.indexOf(b.intent) || a.created_at.localeCompare(b.created_at)
      )[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sendsYesterday = dailyRows
      .filter((row) => row.metric_date === yesterday)
      .reduce((sum, row) => sum + row.sends, 0);

    return reply.type("text/html").send(
      renderShell(
        shell,
        renderBrunoPage(turns, {
          agentPaused: shell.agentPaused,
          pendingCount: shell.pendingCount,
          hottestWho: hottest ? (hottest.company_name ?? hottest.email ?? undefined) : undefined,
          needsReadCount: replies24h.find((r) => r.intent === "unclear")?.count ?? 0,
          replies24h: replies24h.filter((r) => r.intent !== "unclear").map((r) => ({ intent: r.intent, count: r.count })),
          sendsYesterday: dailyRows.length > 0 ? sendsYesterday : undefined,
          failedJobs: shell.failedJobs,
          lastPollAgo: agoLabel(minutesSince(lastPollAt)),
          campaignStatus: pulse?.statusLabel,
          campaignSent: pulse?.sent,
          dailyLimit: pulse?.dailyLimit
        },
        chatId,
        modelLabel(),
        isChannel ? "channel" : "chat")
      )
    );
  });

  // Inbox — who replied, hottest first
  app.get("/dashboard/inbox", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/inbox")) return reply;
    const [shell, drafts, feed, activity, pulse] = await Promise.all([
      loadShellContext("inbox", "Inbox", true),
      listPendingDrafts(20),
      listRecentClassifications(40),
      listRecentApprovals(12),
      loadCampaignPulse()
    ]);

    const cards = drafts
      .map(toDraftCard)
      .sort(
        (a, b) => HOT_INTENTS.indexOf(a.intent) - HOT_INTENTS.indexOf(b.intent) || a.createdAt.localeCompare(b.createdAt)
      );
    const needsRead = feed.filter((row) => row.intent === "unclear" && row.draft_status === null).slice(0, 10).map(toFeedModel);
    const handled = feed.filter((row) => HANDLED_INTENTS.includes(row.intent)).slice(0, 15).map(toFeedModel);

    // Enrich the actionable people with their live Instantly engagement.
    const engagement = await loadEngagementMap(
      [...cards.map((c) => c.email), ...needsRead.map((r) => r.email)],
      pulse?.campaignId
    );
    for (const card of cards) {
      if (card.email) card.engagement = engagement.get(card.email.toLowerCase());
    }
    for (const row of needsRead) {
      if (row.email) row.engagement = engagement.get(row.email.toLowerCase());
    }
    const log = activity.map((row) => ({
      action: row.action,
      companyName: row.company_name ?? undefined,
      email: row.email ?? undefined,
      createdAt: row.created_at
    }));

    return reply
      .type("text/html")
      .send(renderShell(shell, renderInboxPage(cards, needsRead, handled, log, shell.generatedAt, pulse ?? undefined)));
  });

  // Campaign — is the machine sending, and is it working?
  app.get("/dashboard/campaign", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/campaign")) return reply;
    const [shell, dailyRows, pulse] = await Promise.all([
      loadShellContext("campaign", "Campaign", true),
      listRecentDailyMetrics(7),
      loadCampaignPulse()
    ]);

    // metrics_daily has one row per (date, campaign); collapse to one row per date.
    const byDate = new Map<string, { date: string; sends: number; replies: number; bounces: number; positive: number }>();
    for (const row of dailyRows) {
      const day = byDate.get(row.metric_date) ?? { date: row.metric_date, sends: 0, replies: 0, bounces: 0, positive: 0 };
      day.sends += row.sends;
      day.replies += row.replies;
      day.bounces += row.bounces;
      day.positive += row.positive_replies;
      byDate.set(row.metric_date, day);
    }
    const daily = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));

    return reply.type("text/html").send(
      renderShell(
        shell,
        renderCampaignPage({
          sends7d: daily.reduce((sum, day) => sum + day.sends, 0),
          replies7d: daily.reduce((sum, day) => sum + day.replies, 0),
          bounces7d: daily.reduce((sum, day) => sum + day.bounces, 0),
          positive7d: daily.reduce((sum, day) => sum + day.positive, 0),
          daily,
          pulse: pulse ?? undefined
        })
      )
    );
  });

  // System — one honest sentence; tech behind a toggle
  app.get("/dashboard/system", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/system")) return reply;
    const [shell, queue, oldestQueuedMinutes, groups, lastPollAt, pulse] = await Promise.all([
      loadShellContext("system", "System", true),
      getQueueSummary(),
      getOldestQueuedJobAgeMinutes(),
      getFailedJobGroups(),
      getConfigValue<string>("last_poll_success_at"),
      loadCampaignPulse()
    ]);
    const pollAgeMinutes = minutesSince(lastPollAt);
    return reply.type("text/html").send(
      renderShell(
        shell,
        renderSystemPage(
          {
            agentPaused: shell.agentPaused,
            queued: queue.queued ?? 0,
            running: queue.running ?? 0,
            failed: queue.failed ?? 0,
            oldestQueuedMinutes,
            lastPollAgo: agoLabel(pollAgeMinutes),
            lastPollStale: !shell.agentPaused && pollAgeMinutes !== undefined && pollAgeMinutes > 15,
            groups,
            instantlyOk: pulse !== null,
            claudeOk: hasClaudeKey()
          },
          shell.generatedAt
        )
      )
    );
  });

  // Lead dossier — everything known about one person
  app.get("/dashboard/lead", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/lead")) return reply;
    const emailRaw = (request.query as Record<string, unknown>)?.email;
    if (typeof emailRaw !== "string" || !emailRaw.includes("@")) return reply.redirect("/dashboard/leads", 302);
    const email = emailRaw.trim().toLowerCase();

    const [shell, pulse, activity] = await Promise.all([
      loadShellContext("leads", "Lead", true),
      loadCampaignPulse(),
      getLeadActivity(email)
    ]);

    let record: InstantlyLeadRecord | null = null;
    let thread: LeadEmailItem[] = [];
    let threadUnavailable = false;
    try {
      record = await cachedFetch<InstantlyLeadRecord | null>(`lead-rec:${email}`, 600, async () => {
        return (await getLeadRecord({ email, campaignId: pulse?.campaignId })) ?? null;
      });
    } catch {
      record = null;
    }
    try {
      thread = await cachedFetch<LeadEmailItem[]>(`lead-thread:${email}`, 300, () => listLeadEmails({ leadEmail: email, limit: 50 }));
    } catch {
      threadUnavailable = true;
    }

    const timeline: TimelineItem[] = [];
    for (const item of thread) {
      timeline.push(
        item.direction === "sent"
          ? { kind: "sent", at: item.at, subject: item.subject, from: item.from, text: item.text }
          : { kind: "received", at: item.at, subject: item.subject, text: item.text }
      );
    }
    for (const c of activity.classifications) {
      timeline.push({
        kind: "read",
        at: c.created_at,
        intent: c.intent,
        confidence: c.confidence,
        reason: c.reason,
        suggested: c.suggested_next_action ?? undefined
      });
    }
    for (const a of activity.approvals) {
      const cls = activity.classifications.find((c) => c.draft_id === a.draft_id);
      timeline.push({
        kind: "decision",
        at: a.created_at,
        action: a.action,
        notes: a.notes ?? undefined,
        original: cls?.draft_body ?? undefined,
        finalText: a.final_body ?? undefined
      });
    }
    for (const s of activity.suppressions) {
      timeline.push({ kind: "suppression", at: s.created_at, reason: s.reason });
    }
    timeline.sort((a, b) => (new Date(a.at ?? 0).getTime() || 0) - (new Date(b.at ?? 0).getTime() || 0));

    const name = record ? [record.firstName, record.lastName].filter(Boolean).join(" ") || undefined : undefined;
    return reply.type("text/html").send(
      renderShell(
        shell,
        renderLeadPage(
          {
            email,
            name,
            company: record?.companyName,
            interestLabel: interestStatusLabel(record?.interestStatus),
            sequenceLabel: leadStatusLabel(record?.status),
            engagement: record ?? undefined,
            customFields: record?.customFields ?? {},
            hasPendingDraft: activity.classifications.some((c) => c.draft_status === "drafted"),
            timeline,
            threadUnavailable
          },
          shell.generatedAt
        )
      )
    );
  });

  // Leads — the CRM view
  app.get("/dashboard/leads", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/leads")) return reply;
    const [shell, pulse] = await Promise.all([loadShellContext("leads", "Leads", true), loadCampaignPulse()]);

    let rows: CrmRow[] = [];
    let capped = false;
    if (pulse) {
      try {
        const leads = await cachedFetch<InstantlyLeadRecord[]>("crm:leads", 600, async () => {
          const all: InstantlyLeadRecord[] = [];
          let cursor: string | undefined;
          let pages = 0;
          do {
            const page = await listLeadRecordsPage({ campaignId: pulse.campaignId, limit: 100, startingAfter: cursor });
            all.push(...page.leads);
            cursor = page.nextStartingAfter;
            pages += 1;
          } while (cursor && pages < 10);
          return all;
        });
        capped = leads.length >= 1000;
        rows = leads.slice(0, 1000).map((lead) => {
          const tags: string[] = [];
          if (lead.replyCount > 0) tags.push("replied");
          if (lead.interestStatus !== undefined && lead.interestStatus >= 1) tags.push("interested");
          if (lead.status === 1 || lead.status === 2) tags.push("in-sequence");
          if (lead.status === 3) tags.push("finished");
          if (lead.status !== undefined && lead.status < 0) tags.push("suppressed");
          return {
            email: lead.email,
            name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
            company: lead.companyName,
            interestLabel: interestStatusLabel(lead.interestStatus),
            sequenceLabel: leadStatusLabel(lead.status),
            opens: lead.openCount,
            clicks: lead.clickCount,
            replies: lead.replyCount,
            lastContactAt: lead.lastContactAt,
            tags: tags.join(" ")
          };
        });
      } catch {
        rows = [];
      }
    }
    return reply.type("text/html").send(renderShell(shell, renderLeadsPage(rows, shell.generatedAt, capped)));
  });

  // Search — Bruno's records + Instantly's lead database
  app.get("/dashboard/search", async (request, reply) => {
    if (!authorizePage(request, reply, "/dashboard/search")) return reply;
    const qRaw = (request.query as Record<string, unknown>)?.q;
    const q = typeof qRaw === "string" ? qRaw.trim() : "";
    if (q.length < 2) return reply.redirect("/dashboard/leads", 302);

    const [shell, local, pulse] = await Promise.all([
      loadShellContext("leads", "Search", false),
      searchLeadsLocal(q),
      loadCampaignPulse()
    ]);

    const results = new Map<string, SearchResultRow>();
    for (const row of local) {
      results.set(row.email, {
        email: row.email,
        company: row.company_name ?? undefined,
        detail: `last reply read as ${row.last_intent ?? "?"}`,
        pendingDraft: row.pending_draft
      });
    }
    try {
      const remote = await listLeadRecordsPage({ campaignId: pulse?.campaignId, search: q, limit: 10 });
      for (const lead of remote.leads) {
        const key = lead.email.toLowerCase();
        if (results.has(key)) continue;
        results.set(key, {
          email: key,
          name: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || undefined,
          company: lead.companyName,
          detail: [leadStatusLabel(lead.status), interestStatusLabel(lead.interestStatus)].filter(Boolean).join(" · ") || "in the lead database"
        });
      }
    } catch {
      // Instantly search unavailable — local results still render.
    }

    return reply.type("text/html").send(renderShell(shell, renderSearchPage(q, [...results.values()].slice(0, 20))));
  });

  // ————— Lead pipeline write-back —————

  app.post("/dashboard/api/lead/interest", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });
    const parsed = z
      .object({ email: z.string().email(), status: z.number().int().min(-3).max(4) })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "email and status are required" });

    const pulse = await loadCampaignPulse();
    try {
      await setLeadInterest({
        email: parsed.data.email,
        interestValue: parsed.data.status,
        campaignId: pulse?.campaignId
      });
    } catch (error) {
      request.log.error({ err: error }, "lead interest update failed");
      return reply.code(502).send({ error: "Instantly rejected the update" });
    }
    await deleteCachedValue(`lead-rec:${parsed.data.email.toLowerCase()}`);
    await deleteCachedValue("crm:leads");
    return reply.send({ ok: true });
  });

  // ————— Agent chat API —————

  app.post("/dashboard/api/chat", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });

    const parsed = z
      .object({ message: z.string().min(1).max(4000), chatId: z.string().regex(CHAT_ID_PATTERN).default("console") })
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "message is required" });

    const threadKey = threadKeyFor(parsed.data.chatId);
    const message = parsed.data.message.trim();
    await appendConversationTurn(threadKey, "user", message);

    try {
      let history;
      if (parsed.data.chatId === "updates") {
        // Channel replies keep Bruno's own feed as context (user-first API rule
        // satisfied with a synthetic opener).
        history = await loadChannelConversation(threadKey, 30);
        if (history[0]?.role === "assistant") {
          history.unshift({ role: "user", content: "[Opening Bruno's updates feed — the assistant posts below are your own proactive updates.]" });
        }
      } else {
        history = await loadConversation(threadKey, 30);
      }
      const result = await runOutboundAgent(history);
      await appendConversationTurn(threadKey, "assistant", result.text);
      return reply.send({ text: result.text, toolCalls: result.toolCalls });
    } catch (error) {
      request.log.error({ err: error }, "dashboard chat: agent run failed");
      return reply.code(502).send({ error: "The agent hit an error answering that — try again." });
    }
  });

  // ————— Draft actions —————

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

    const claimed = await claimDraftForSend(id);
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
    // Bruno's original stays on the draft; the human's final version goes on the
    // approval row (final_subject/final_body) — the edit diff feeds Phase C learning.
    await recordApproval({
      draftId: id,
      action: edited ? "edited" : "approved",
      notes: edited ? "edited on dashboard before send" : undefined,
      finalSubject,
      finalBody
    });
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

  // ————— Operations actions —————

  app.post("/dashboard/api/ops/retry", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });
    const parsed = z.object({ name: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "job name is required" });
    const retried = await retryLatestFailedJob(parsed.data.name);
    return reply.send({ ok: true, retried });
  });

  app.post("/dashboard/api/ops/clear", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });
    const parsed = z.object({ name: z.string().min(1).optional() }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid request" });
    const cleared = await clearFailedJobs(parsed.data.name);
    return reply.send({ ok: true, cleared });
  });

  // ————— Kill switch —————

  app.post("/dashboard/api/agent/pause", async (request, reply) => {
    if (!isAuthorized(request)) return reply.code(401).send({ error: "not authorized" });

    const parsed = z.object({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "paused flag is required" });

    await setAgentPaused(parsed.data.paused);
    return reply.send({ ok: true, paused: parsed.data.paused });
  });
}
