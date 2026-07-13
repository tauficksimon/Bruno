// Page bodies for the dashboard shell. Data models are assembled in routes.ts;
// these functions only turn them into HTML (everything dynamic escaped).

import { escapeHtml, intentBadge, relativeTime, renderChatTurns, whoLabel, type ChatTurn } from "./ui.js";

const INTENT_ORDER = ["positive", "question", "objection", "not_now", "negative", "unsubscribe", "unclear"];

// ————— Agent (chat home) —————

export function renderAgentPage(turns: ChatTurn[]) {
  const suggestions =
    turns.length === 0
      ? `<div class="suggestions">
          <button class="suggestion">How is the campaign doing?</button>
          <button class="suggestion">What's our inbox health?</button>
          <button class="suggestion">Any replies this week?</button>
          <button class="suggestion">How many leads are loaded?</button>
        </div>`
      : "";
  return `
  <main class="main-chat reveal">
    <div class="chat" data-chat>
      <div class="chat-scroll" data-chat-scroll>
        ${renderChatTurns(
          turns,
          "This is your agent — it watches the outbound campaign, reads every reply, and answers with live numbers. Ask it anything."
        )}
      </div>
      ${suggestions}
      <form class="composer" data-chat-form>
        <textarea name="message" rows="2" placeholder="Ask the agent… (Enter to send, Shift+Enter for a new line)" required></textarea>
        <button class="btn btn-send" type="submit">Send</button>
      </form>
    </div>
  </main>`;
}

// ————— Approvals —————

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
    ${
      draft.prospectText
        ? `<div class="prospect"><div class="section-label">Prospect wrote</div><blockquote>${escapeHtml(draft.prospectText)}</blockquote></div>`
        : ""
    }
    <div class="agent-note"><span class="section-label">Agent read</span> ${escapeHtml(draft.reason)}${
      draft.internalReason ? ` · <em>${escapeHtml(draft.internalReason)}</em>` : ""
    }</div>
    <label class="field">
      <span class="section-label">Subject</span>
      <input type="text" name="subject" value="${escapeHtml(draft.subject)}" />
    </label>
    <label class="field">
      <span class="section-label">Draft reply — edit freely, then approve</span>
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

export function renderApprovalsPage(drafts: DraftCardModel[], activity: ActivityModel[], now: Date) {
  const cards = drafts.map((draft) => renderDraftCard(draft, now)).join("\n");
  const empty = `
    <div class="empty">
      <div class="empty-mark">✓</div>
      <p>Nothing waiting. New replies land here within ~5 minutes of arriving.</p>
    </div>`;
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
    <h2>Waiting on you <span class="count mono" id="pending-count">${drafts.length}</span></h2>
    ${drafts.length > 0 ? cards : empty}
    <h2>Recent actions</h2>
    ${log}
  </main>`;
}

// ————— Replies —————

export interface ReplyFeedModel {
  companyName?: string;
  email?: string;
  intent: string;
  reason: string;
  createdAt: string;
}

export function renderRepliesPage(feed: ReplyFeedModel[], intentCounts: Record<string, number>, now: Date) {
  const entries = INTENT_ORDER.map((intent) => ({ intent, count: intentCounts[intent] ?? 0 })).filter((e) => e.count > 0);
  const max = entries.length > 0 ? Math.max(...entries.map((e) => e.count)) : 0;
  const mix =
    entries.length === 0
      ? `<p class="muted">No classified replies in the last 7 days.</p>`
      : entries
          .map(
            (entry) => `
            <div class="mix-row">
              <span class="mix-label">${intentBadge(entry.intent)}</span>
              <span class="mix-track"><span class="mix-bar" style="width:${Math.max(4, Math.round((entry.count / max) * 100))}%"></span></span>
              <span class="mix-count mono">${entry.count}</span>
            </div>`
          )
          .join("\n");

  const rows =
    feed.length === 0
      ? `<p class="muted">No replies classified yet.</p>`
      : feed
          .map(
            (row) => `
            <div class="feed-row">
              <div class="feed-top">
                <strong>${escapeHtml(whoLabel(row.companyName, row.email))}</strong>
                ${intentBadge(row.intent)}
                <span class="mono muted">${relativeTime(row.createdAt, now)}</span>
              </div>
              <div class="feed-reason muted">${escapeHtml(row.reason)}</div>
            </div>`
          )
          .join("\n");

  return `
  <main class="reveal">
    <h2>Reply mix · 7d</h2>
    ${mix}
    <h2>All classified replies</h2>
    ${rows}
  </main>`;
}

// ————— Metrics —————

export interface MetricsModel {
  sends7d: number;
  replies7d: number;
  bounces7d: number;
  positive7d: number;
  daily: Array<{ date: string; sends: number; replies: number; bounces: number }>;
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function renderMetricsPage(m: MetricsModel) {
  const table =
    m.daily.length === 0
      ? `<p class="muted">No metrics yet — the nightly rollup fills this in once sending starts.</p>`
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

  return `
  <main class="reveal">
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
        <div class="tile-sub">golden rule: scale at &gt;3%</div>
      </div>
      <div class="tile">
        <div class="tile-label">Bounce rate · 7d</div>
        <div class="tile-value">${formatPercent(m.bounces7d, m.sends7d)}</div>
        <div class="tile-sub">keep under 3%</div>
      </div>
    </section>
    <h2>Last 7 days</h2>
    ${table}
  </main>`;
}

// ————— Operations —————

export interface OpsModel {
  queued: number;
  running: number;
  failed: number;
  oldestQueuedMinutes?: number;
  groups: Array<{ name: string; count: number; last_failed_at: string; latest_error: string | null }>;
}

export function renderOpsPage(ops: OpsModel, now: Date) {
  const failedTileClass = ops.failed > 0 ? " tile-bad" : "";
  const groups =
    ops.groups.length === 0
      ? `<div class="empty"><div class="empty-mark">✓</div><p>No failed jobs. Silence means healthy.</p></div>`
      : `
      <div class="table-scroll">
        <table>
          <thead><tr><th>Job</th><th class="num">Failures</th><th>Last failed</th><th>Most recent error</th><th></th></tr></thead>
          <tbody>
            ${ops.groups
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
    <section class="kpis">
      <div class="tile">
        <div class="tile-label">Queued</div>
        <div class="tile-value">${ops.queued}</div>
        <div class="tile-sub">${ops.oldestQueuedMinutes !== undefined ? `oldest waiting ${ops.oldestQueuedMinutes}m` : "nothing overdue"}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Running</div>
        <div class="tile-value">${ops.running}</div>
        <div class="tile-sub">in flight right now</div>
      </div>
      <div class="tile${failedTileClass}">
        <div class="tile-label">Failed</div>
        <div class="tile-value">${ops.failed}</div>
        <div class="tile-sub">${ops.failed > 0 ? "gave up after 5 attempts each" : "all clear"}</div>
      </div>
    </section>
    <h2>What "failed" means</h2>
    <p class="muted" style="max-width:640px">
      Background work (checking for replies, rolling up metrics, health checks) runs as jobs.
      A job retries itself up to 5 times; only then is it marked failed and shown here with its
      error. A repeating count on the same job usually means one root cause — read the most
      recent error, fix the cause, then use <strong>Retry latest</strong> to confirm the fix and
      <strong>Clear</strong> to remove the old records.
    </p>
    <h2>Failed jobs by type <span class="count mono">${ops.failed}</span></h2>
    ${groups}
  </main>`;
}
