// Page bodies for the console shell. Data models are assembled in routes.ts;
// these functions only turn them into HTML (everything dynamic escaped).

import { leadStatusLabel } from "../integrations/instantly.js";
import { escapeHtml, intentBadge, relativeTime, renderChatTurns, whoLabel, type ChatTurn } from "./ui.js";

const INTENT_ORDER = ["positive", "question", "objection", "not_now", "negative", "unsubscribe", "unclear"];

// ————— Live Instantly views (shared) —————

export interface EngagementView {
  openCount: number;
  clickCount: number;
  replyCount: number;
  status?: number;
  lastContactAt?: string;
  lastStepId?: string;
  lastStepFrom?: string;
}

export interface PulseView {
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

function ratePercent(numerator: number, denominator: number) {
  if (denominator <= 0) return undefined;
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** "email 2 · variant B" from Instantly's stepID format "0_2_1". */
function stepLabel(stepId?: string) {
  if (!stepId) return undefined;
  const parts = stepId.split("_");
  if (parts.length < 2) return undefined;
  const step = parts[1];
  const variant = parts.length > 2 ? Number(parts[2]) : undefined;
  const variantLabel = variant !== undefined && !Number.isNaN(variant) ? ` · variant ${String.fromCharCode(65 + variant)}` : "";
  return `email ${step}${variantLabel}`;
}

export function renderPulseStrip(pulse: PulseView) {
  const openRate = ratePercent(pulse.opensUnique, pulse.sent);
  const replyRate = ratePercent(pulse.repliesUnique, pulse.sent);
  const items: string[] = [
    `<span class="pulse-item">campaign <strong>${escapeHtml(pulse.statusLabel)}</strong></span>`,
    `<span class="pulse-item"><strong>${pulse.sent}</strong> sent</span>`,
    pulse.openTracking === false
      ? `<span class="pulse-item pulse-dim">opens n/a (tracking off)</span>`
      : `<span class="pulse-item"><strong>${pulse.opensUnique}</strong> opens${openRate ? ` (${openRate})` : ""}</span>`,
    `<span class="pulse-item"><strong>${pulse.clicks}</strong> clicks</span>`,
    `<span class="pulse-item"><strong>${pulse.repliesUnique}</strong> replies${replyRate ? ` (${replyRate})` : ""}</span>`,
    `<span class="pulse-item"><strong>${pulse.bounces}</strong> bounced</span>`
  ];
  if (pulse.leadCount !== undefined) {
    items.push(`<span class="pulse-item"><strong>${pulse.leadCount}${pulse.leadCountCapped ? "+" : ""}</strong> leads</span>`);
  }
  if (pulse.dailyLimit !== undefined) {
    items.push(`<span class="pulse-item">limit <strong>${pulse.dailyLimit}</strong>/day</span>`);
  }
  return `
  <section class="pulse">
    <span class="pulse-label">live · instantly</span>
    ${items.join("\n")}
  </section>`;
}

function engagementChips(engagement: EngagementView | undefined, now: Date) {
  if (!engagement) return "";
  const chips: string[] = [];
  if (engagement.openCount > 0) chips.push(`opened ${engagement.openCount}×`);
  if (engagement.clickCount > 0) chips.push(`clicked ${engagement.clickCount}×`);
  const step = stepLabel(engagement.lastStepId);
  if (step) chips.push(`last got ${step}`);
  if (engagement.lastStepFrom) chips.push(`from ${engagement.lastStepFrom}`);
  if (engagement.lastContactAt) chips.push(`last touch ${relativeTime(engagement.lastContactAt, now)}`);
  const status = leadStatusLabel(engagement.status);
  if (status) chips.push(status);
  if (chips.length === 0) return "";
  return `<div class="eng">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>`;
}

// ————— Bruno (home: briefing + chat) —————

export interface BriefingModel {
  agentPaused: boolean;
  pendingCount: number;
  hottestWho?: string;
  needsReadCount: number;
  replies24h: Array<{ intent: string; count: number }>;
  sendsYesterday?: number;
  failedJobs: number;
  lastPollAgo?: string;
  campaignStatus?: string;
  campaignSent?: number;
  dailyLimit?: number;
}

function briefingRows(b: BriefingModel) {
  const rows: string[] = [];

  if (b.agentPaused) {
    rows.push(`<span class="b-flag b-warn">paused</span> Bruno is paused — replies aren't being processed. Resume him from the sidebar.`);
  }
  if (b.pendingCount > 0) {
    rows.push(
      `<span class="b-flag b-hot">act</span> <strong>${b.pendingCount} repl${b.pendingCount === 1 ? "y" : "ies"} waiting on you</strong>${
        b.hottestWho ? ` — hottest: ${escapeHtml(b.hottestWho)}` : ""
      } <a href="/dashboard/inbox">open Inbox →</a>`
    );
  }
  if (b.needsReadCount > 0) {
    rows.push(
      `<span class="b-flag">read</span> ${b.needsReadCount} repl${b.needsReadCount === 1 ? "y" : "ies"} Bruno couldn't classify — worth a human glance. <a href="/dashboard/inbox">Inbox →</a>`
    );
  }
  const totalNew = b.replies24h.reduce((sum, r) => sum + r.count, 0);
  if (totalNew > 0) {
    const parts = b.replies24h
      .slice()
      .sort((a, z) => INTENT_ORDER.indexOf(a.intent) - INTENT_ORDER.indexOf(z.intent))
      .map((r) => `${r.count} ${r.intent.replace("_", " ")}`);
    rows.push(`<span class="b-flag">new</span> ${totalNew} new repl${totalNew === 1 ? "y" : "ies"} in the last 24h: ${parts.join(", ")}.`);
  }
  if (b.sendsYesterday !== undefined) {
    rows.push(`<span class="b-flag">sent</span> ${b.sendsYesterday} email${b.sendsYesterday === 1 ? "" : "s"} went out yesterday. <a href="/dashboard/campaign">Campaign →</a>`);
  }
  if (b.campaignStatus) {
    rows.push(
      `<span class="b-flag">camp</span> Campaign is <strong>${escapeHtml(b.campaignStatus)}</strong>${
        b.campaignSent !== undefined ? ` — ${b.campaignSent} sent lifetime` : ""
      }${b.dailyLimit !== undefined ? `, limit ${b.dailyLimit}/day` : ""}. <a href="/dashboard/campaign">Campaign →</a>`
    );
  }
  if (b.failedJobs > 0) {
    rows.push(`<span class="b-flag b-warn">check</span> ${b.failedJobs} background task${b.failedJobs === 1 ? "" : "s"} failed. <a href="/dashboard/system">System →</a>`);
  }
  if (rows.length === 0 || (!b.agentPaused && b.failedJobs === 0)) {
    rows.push(
      `<span class="b-flag b-ok">ok</span> Everything running normally${b.lastPollAgo ? ` — replies last checked ${b.lastPollAgo}` : ""}.`
    );
  }
  return rows;
}

export function renderBrunoPage(turns: ChatTurn[], briefing: BriefingModel) {
  const welcome = `
    <div class="chat-welcome">
      <div class="bruno-mark">✳</div>
      <h2>Ask Bruno</h2>
      <p>He runs your outbound — watches the campaign, reads every reply, drafts the responses — and answers with live numbers, not guesses.</p>
      <div class="suggestions">
        <button class="suggestion">How is the campaign doing?</button>
        <button class="suggestion">What's our inbox health?</button>
        <button class="suggestion">Any replies this week?</button>
        <button class="suggestion">How many leads are loaded?</button>
      </div>
    </div>`;
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return `
  <main class="main-chat reveal">
    <section class="briefing">
      <div class="briefing-title mono">Today · ${dateLabel}</div>
      ${briefingRows(briefing)
        .map((row) => `<div class="briefing-row">${row}</div>`)
        .join("\n")}
    </section>
    <div class="chat" data-chat>
      <div class="chat-scroll" data-chat-scroll>
        ${renderChatTurns(turns, welcome)}
      </div>
      <form class="composer" data-chat-form>
        <textarea name="message" rows="2" placeholder="Ask Bruno… (Enter to send, Shift+Enter for a new line)" required></textarea>
        <button class="btn btn-send" type="submit">Send</button>
      </form>
    </div>
  </main>`;
}

// ————— Inbox —————

export interface DraftCardModel {
  id: string;
  companyName?: string;
  email?: string;
  intent: string;
  confidence: number;
  reason: string;
  internalReason?: string;
  prospectText?: string;
  subject: string;
  body: string;
  createdAt: string;
  sendFrom?: string;
  canSend: boolean;
  engagement?: EngagementView;
}

export interface ReplyFeedModel {
  companyName?: string;
  email?: string;
  intent: string;
  reason: string;
  createdAt: string;
  prospectText?: string;
  engagement?: EngagementView;
}

export interface ActivityModel {
  action: string;
  companyName?: string;
  email?: string;
  createdAt: string;
}

function renderDraftCard(draft: DraftCardModel, now: Date) {
  const who = whoLabel(draft.companyName, draft.email);
  const confidence = `${Math.round(draft.confidence * 100)}%`;
  const sendNote = draft.canSend
    ? `will send from <strong>${escapeHtml(draft.sendFrom ?? "")}</strong>`
    : `<span class="warn-text">can't auto-send — the reply is missing its Instantly message reference; copy the draft and send it from Instantly</span>`;

  return `
  <article class="card" data-draft-id="${escapeHtml(draft.id)}" data-who="${escapeHtml(who)}">
    <header class="card-head">
      <div>
        <h3>${escapeHtml(who)}</h3>
        ${draft.email ? `<div class="mono muted">${escapeHtml(draft.email)}</div>` : ""}
      </div>
      <div class="card-meta">
        ${intentBadge(draft.intent)}
        <span class="mono muted">${confidence}</span>
        <span class="mono muted">${relativeTime(draft.createdAt, now)}</span>
      </div>
    </header>
    ${engagementChips(draft.engagement, now)}
    ${
      draft.prospectText
        ? `<div class="prospect"><div class="section-label">They wrote</div><blockquote>${escapeHtml(draft.prospectText)}</blockquote></div>`
        : ""
    }
    <div class="agent-note"><span class="section-label">Bruno's read</span> ${escapeHtml(draft.reason)}${
      draft.internalReason ? ` · <em>${escapeHtml(draft.internalReason)}</em>` : ""
    }</div>
    <label class="field">
      <span class="section-label">Subject</span>
      <input type="text" name="subject" value="${escapeHtml(draft.subject)}" />
    </label>
    <label class="field">
      <span class="section-label">Bruno's draft — edit freely, then approve</span>
      <textarea name="body" rows="9">${escapeHtml(draft.body)}</textarea>
    </label>
    <footer class="card-actions">
      <button class="btn btn-approve" data-action="approve" ${draft.canSend ? "" : 'data-locked="1" disabled'}>Approve &amp; send</button>
      <button class="btn btn-reject" data-action="reject">Reject</button>
      <span class="send-note mono">${sendNote}</span>
      <span class="action-status mono" aria-live="polite"></span>
    </footer>
  </article>`;
}

function handledDescription(intent: string) {
  switch (intent) {
    case "negative":
      return "not interested — Bruno stopped their emails and added them to the do-not-contact list";
    case "unsubscribe":
      return "asked to unsubscribe — honored and added to the do-not-contact list";
    case "not_now":
      return "not right now — logged to revisit in a couple of months";
    default:
      return "logged";
  }
}

export function renderInboxPage(
  drafts: DraftCardModel[],
  needsRead: ReplyFeedModel[],
  handled: ReplyFeedModel[],
  activity: ActivityModel[],
  now: Date,
  pulse?: PulseView
) {
  const cards = drafts.map((draft) => renderDraftCard(draft, now)).join("\n");
  const empty = `
    <div class="empty">
      <div class="empty-mark">✓</div>
      <p>No one is waiting on you. New replies show up here within ~5 minutes of arriving.</p>
    </div>`;

  const needsReadHtml =
    needsRead.length === 0
      ? ""
      : `
      <h2>Needs your read <span class="count mono">${needsRead.length}</span></h2>
      <p class="muted" style="margin-top:-4px">Bruno wasn't confident what these mean — give them a quick human glance; if one is warm, reply from Instantly directly.</p>
      ${needsRead
        .map(
          (row) => `
          <article class="card">
            <header class="card-head">
              <div><h3>${escapeHtml(whoLabel(row.companyName, row.email))}</h3>
              ${row.email ? `<div class="mono muted">${escapeHtml(row.email)}</div>` : ""}</div>
              <div class="card-meta">${intentBadge(row.intent)}<span class="mono muted">${relativeTime(row.createdAt, now)}</span></div>
            </header>
            ${engagementChips(row.engagement, now)}
            ${row.prospectText ? `<div class="prospect"><div class="section-label">They wrote</div><blockquote>${escapeHtml(row.prospectText)}</blockquote></div>` : ""}
            <div class="agent-note"><span class="section-label">Bruno's read</span> ${escapeHtml(row.reason)}</div>
          </article>`
        )
        .join("\n")}`;

  const handledHtml =
    handled.length === 0
      ? `<p class="muted">Nothing yet — negative and unsubscribe replies will be handled automatically and listed here.</p>`
      : handled
          .map(
            (row) => `
            <div class="feed-row">
              <div class="feed-top">
                <strong>${escapeHtml(whoLabel(row.companyName, row.email))}</strong>
                ${intentBadge(row.intent)}
                <span class="mono muted">${relativeTime(row.createdAt, now)}</span>
              </div>
              <div class="feed-reason muted">${escapeHtml(handledDescription(row.intent))}</div>
            </div>`
          )
          .join("\n");

  const log =
    activity.length === 0
      ? `<p class="muted">No approvals or rejections yet.</p>`
      : activity
          .map(
            (row) => `
            <div class="log-row mono">
              <span class="log-action log-${escapeHtml(row.action)}">${escapeHtml(row.action)}</span>
              <span>${escapeHtml(whoLabel(row.companyName, row.email))}</span>
              <span class="muted">${relativeTime(row.createdAt, now)}</span>
            </div>`
          )
          .join("\n");

  return `
  <main class="reveal">
    ${pulse ? renderPulseStrip(pulse) : ""}
    <h2>Waiting on you <span class="count mono" id="pending-count">${drafts.length}</span></h2>
    ${drafts.length > 0 ? cards : empty}
    ${needsReadHtml}
    <h2>Handled for you · 7d</h2>
    ${handledHtml}
    <h2>Recent actions</h2>
    ${log}
  </main>`;
}

// ————— Campaign —————

export interface CampaignModel {
  sends7d: number;
  replies7d: number;
  bounces7d: number;
  positive7d: number;
  daily: Array<{ date: string; sends: number; replies: number; bounces: number }>;
  pulse?: PulseView;
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function renderLiveTiles(pulse: PulseView) {
  const replyRate = ratePercent(pulse.repliesUnique, pulse.sent) ?? "—";
  const openValue = pulse.openTracking === false ? "off" : String(pulse.opensUnique);
  const openSub =
    pulse.openTracking === false
      ? "open tracking disabled (plain-text)"
      : ratePercent(pulse.opensUnique, pulse.sent)
        ? `${ratePercent(pulse.opensUnique, pulse.sent)} open rate`
        : "no opens recorded yet";
  const replySub =
    pulse.sent < 300
      ? "too few sends to judge vs the 3% rule"
      : `${replyRate} vs the 3% golden rule`;
  return `
    <section class="kpis">
      <div class="tile">
        <div class="tile-label">Sent · lifetime</div>
        <div class="tile-value">${pulse.sent.toLocaleString("en-US")}</div>
        <div class="tile-sub">${pulse.leadCount !== undefined ? `${pulse.leadCount}${pulse.leadCountCapped ? "+" : ""} leads loaded` : "live from Instantly"}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Opens</div>
        <div class="tile-value">${openValue}</div>
        <div class="tile-sub">${openSub}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Replies</div>
        <div class="tile-value">${pulse.repliesUnique}</div>
        <div class="tile-sub">${replySub}</div>
      </div>
      <div class="tile${pulse.bounces > 0 && pulse.sent > 0 && pulse.bounces / pulse.sent > 0.03 ? " tile-bad" : ""}">
        <div class="tile-label">Bounces</div>
        <div class="tile-value">${pulse.bounces}</div>
        <div class="tile-sub">${pulse.clicks} link clicks · ${pulse.unsubscribes} unsubscribed</div>
      </div>
    </section>`;
}

function renderInboxHealthTable(pulse: PulseView) {
  if (pulse.inboxes.length === 0) return "";
  const rows = pulse.inboxes
    .map(
      (inbox) => `
      <tr>
        <td class="mono">${escapeHtml(inbox.email)}</td>
        <td class="mono num">${inbox.todaySent ?? "—"}</td>
        <td class="mono num">${inbox.last7Sent}</td>
        <td class="mono num">${Math.round(inbox.landingRate * 100)}%</td>
        <td>${inbox.landingRate >= 0.9 ? `<span class="ok-text">healthy</span>` : `<span class="warn-text">watch — landing below 90%</span>`}</td>
      </tr>`
    )
    .join("\n");
  return `
    <h2>Sending inboxes</h2>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Inbox</th><th class="num">Warmup today</th><th class="num">7d warmup</th><th class="num">Inbox landing</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function renderCampaignPage(m: CampaignModel) {
  const table =
    m.daily.length === 0
      ? `<p class="muted">No daily history yet — this fills in nightly once sending starts.</p>`
      : `
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th class="num">Sent</th><th class="num">Replies</th><th class="num">Bounces</th></tr></thead>
          <tbody>
            ${m.daily
              .map(
                (day) => `
                <tr>
                  <td class="mono">${escapeHtml(day.date)}</td>
                  <td class="mono num">${day.sends}</td>
                  <td class="mono num">${day.replies}</td>
                  <td class="mono num">${day.bounces}</td>
                </tr>`
              )
              .join("\n")}
          </tbody>
        </table>
      </div>`;

  const fallbackTiles = `
    <section class="kpis">
      <div class="tile">
        <div class="tile-label">Sends · 7d</div>
        <div class="tile-value">${m.sends7d.toLocaleString("en-US")}</div>
        <div class="tile-sub">${m.bounces7d.toLocaleString("en-US")} bounced</div>
      </div>
      <div class="tile">
        <div class="tile-label">Replies · 7d</div>
        <div class="tile-value">${m.replies7d.toLocaleString("en-US")}</div>
        <div class="tile-sub">${m.positive7d.toLocaleString("en-US")} positive</div>
      </div>
      <div class="tile">
        <div class="tile-label">Reply rate · 7d</div>
        <div class="tile-value">${formatPercent(m.replies7d, m.sends7d)}</div>
        <div class="tile-sub">${m.sends7d < 300 ? "too few sends to judge yet (need 300+)" : "golden rule: scale at >3%"}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Bounce rate · 7d</div>
        <div class="tile-value">${formatPercent(m.bounces7d, m.sends7d)}</div>
        <div class="tile-sub">keep under 3%</div>
      </div>
    </section>`;

  return `
  <main class="reveal">
    ${m.pulse ? renderPulseStrip(m.pulse) : ""}
    ${m.pulse ? renderLiveTiles(m.pulse) : fallbackTiles}
    ${m.pulse ? renderInboxHealthTable(m.pulse) : ""}
    <h2>Last 7 days</h2>
    ${table}
  </main>`;
}

// ————— System —————

export interface SystemModel {
  agentPaused: boolean;
  queued: number;
  running: number;
  failed: number;
  oldestQueuedMinutes?: number;
  lastPollAgo?: string;
  lastPollStale: boolean;
  groups: Array<{ name: string; count: number; last_failed_at: string; latest_error: string | null }>;
  instantlyOk: boolean;
  claudeOk: boolean;
}

/** Translate the most common raw errors into owner language. */
function plainError(error: string | null) {
  if (!error) return undefined;
  if (/INSTANTLY_API_KEY is not configured|401|Unauthorized|Invalid API key/i.test(error)) {
    return "the Instantly connection is being rejected — the API key is missing or wrong. Emails may still send, but Bruno can't see replies until it's fixed.";
  }
  if (/ANTHROPIC/i.test(error)) {
    return "the Claude AI key is missing or invalid — Bruno can't classify replies or draft responses until it's fixed.";
  }
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|ENOTFOUND/i.test(error)) {
    return "a network problem reaching an outside service — usually temporary.";
  }
  return undefined;
}

export function renderSystemPage(s: SystemModel, now: Date) {
  const problems: string[] = [];
  if (s.agentPaused) problems.push("Bruno is <strong>paused</strong> — nothing is being processed until you resume him (sidebar button).");
  if (!s.instantlyOk) {
    problems.push("Bruno can't reach Instantly right now — live campaign numbers and engagement are unavailable.");
  }
  if (!s.claudeOk) {
    problems.push("The Claude AI key is missing — Bruno can't classify replies, draft responses, or chat until it's added.");
  }
  if (s.lastPollStale) {
    problems.push(`Bruno hasn't been able to check for replies recently${s.lastPollAgo ? ` (last success ${s.lastPollAgo})` : ""}.`);
  }
  if (s.failed > 0) {
    const latest = s.groups[0];
    const translated = latest ? plainError(latest.latest_error) : undefined;
    problems.push(
      `${s.failed} background task${s.failed === 1 ? "" : "s"} gave up after retrying.${translated ? ` In plain terms: ${translated}` : ""}`
    );
  }

  const hero =
    problems.length === 0
      ? `<div class="status-hero status-ok">
           <div class="status-mark">✓</div>
           <div><strong>Everything is running normally.</strong><br/>
           <span class="muted">Bruno checks for replies every 5 minutes${s.lastPollAgo ? ` — last check ${s.lastPollAgo}` : ""}. Silence here means healthy.</span><br/>
           <span class="mono muted">connections: instantly ✓ · claude ✓</span></div>
         </div>`
      : `<div class="status-hero status-bad">
           <div class="status-mark">!</div>
           <div>${problems.map((p) => `<p style="margin:0 0 6px">${p}</p>`).join("")}</div>
         </div>`;

  const groups =
    s.groups.length === 0
      ? `<p class="muted">No failed tasks.</p>`
      : `
      <div class="table-scroll">
        <table>
          <thead><tr><th>Task</th><th class="num">Failures</th><th>Last failed</th><th>Most recent error</th><th></th></tr></thead>
          <tbody>
            ${s.groups
              .map(
                (group) => `
                <tr>
                  <td class="mono">${escapeHtml(group.name)}</td>
                  <td class="mono num">${group.count}</td>
                  <td class="mono">${relativeTime(group.last_failed_at, now)}</td>
                  <td>${group.latest_error ? `<div class="err-detail">${escapeHtml(group.latest_error.slice(0, 500))}</div>` : `<span class="muted">—</span>`}</td>
                  <td class="mono" style="white-space:nowrap">
                    <button class="btn btn-plain" data-ops="retry" data-job-name="${escapeHtml(group.name)}">Retry latest</button>
                    <button class="btn btn-reject" data-ops="clear" data-job-name="${escapeHtml(group.name)}">Clear</button>
                  </td>
                </tr>`
              )
              .join("\n")}
          </tbody>
        </table>
      </div>
      <div class="card-actions" style="margin-top:14px">
        <button class="btn btn-reject" data-ops="clear">Clear all failed jobs</button>
        <span class="send-note mono">clearing deletes the failure records only — the schedules keep running</span>
      </div>`;

  return `
  <main class="reveal">
    ${hero}
    <details class="tech">
      <summary class="mono">Technical details</summary>
      <section class="kpis kpis-3" style="margin-top:16px">
        <div class="tile">
          <div class="tile-label">Queued</div>
          <div class="tile-value">${s.queued}</div>
          <div class="tile-sub">${s.oldestQueuedMinutes !== undefined ? `oldest waiting ${s.oldestQueuedMinutes}m` : "nothing overdue"}</div>
        </div>
        <div class="tile">
          <div class="tile-label">Running</div>
          <div class="tile-value">${s.running}</div>
          <div class="tile-sub">in flight right now</div>
        </div>
        <div class="tile${s.failed > 0 ? " tile-bad" : ""}">
          <div class="tile-label">Failed</div>
          <div class="tile-value">${s.failed}</div>
          <div class="tile-sub">${s.failed > 0 ? "gave up after 5 attempts each" : "all clear"}</div>
        </div>
      </section>
      <h2>Failed tasks by type <span class="count mono">${s.failed}</span></h2>
      ${groups}
    </details>
  </main>`;
}
