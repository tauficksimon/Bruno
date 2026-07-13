// Server-rendered dashboard page. No client framework, no build step: one HTML
// document with inline CSS/JS. Every dynamic string goes through escapeHtml —
// prospect-authored text is untrusted input (same rule as the prompts, AUDIT-M5),
// so it must never reach the page unescaped.

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

export interface ReplyFeedModel {
  companyName?: string;
  email?: string;
  intent: string;
  confidence: number;
  reason: string;
  createdAt: string;
  draftStatus?: string;
}

export interface ActivityModel {
  action: string;
  companyName?: string;
  email?: string;
  intent?: string;
  createdAt: string;
}

export interface DashboardData {
  agentPaused: boolean;
  sends7d: number;
  replies7d: number;
  bounces7d: number;
  pendingCount: number;
  failedJobs: number;
  intentCounts: Record<string, number>;
  daily: Array<{ date: string; sends: number; replies: number; bounces: number }>;
  drafts: DraftCardModel[];
  feed: ReplyFeedModel[];
  activity: ActivityModel[];
  generatedAt: Date;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INTENT_ORDER = ["positive", "question", "objection", "not_now", "negative", "unsubscribe", "unclear"];

// Tinted badge + dark text per intent. The label text always spells the intent,
// so color never carries the meaning alone.
const INTENT_STYLES: Record<string, { bg: string; fg: string }> = {
  positive: { bg: "#e0f3e0", fg: "#006300" },
  question: { bg: "#e3edfb", fg: "#1c5cab" },
  objection: { bg: "#fdeadd", fg: "#a34a17" },
  not_now: { bg: "#efeee8", fg: "#52514e" },
  negative: { bg: "#fbe3e3", fg: "#a32c2c" },
  unsubscribe: { bg: "#f3e0e0", fg: "#7c2222" },
  unclear: { bg: "#faf0d6", fg: "#8a6400" }
};

function intentBadge(intent: string) {
  const style = INTENT_STYLES[intent] ?? INTENT_STYLES.unclear;
  const label = intent.replace("_", " ");
  return `<span class="badge" style="background:${style.bg};color:${style.fg}">${escapeHtml(label)}</span>`;
}

function relativeTime(iso: string, now: Date) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function whoLabel(companyName?: string, email?: string) {
  return companyName?.trim() || email?.trim() || "Unknown lead";
}

function renderKpis(data: DashboardData) {
  const pendingClass = data.pendingCount > 0 ? " tile-attention" : "";
  return `
  <section class="kpis reveal" style="--d:0">
    <div class="tile">
      <div class="tile-label">Sends · 7d</div>
      <div class="tile-value">${data.sends7d.toLocaleString("en-US")}</div>
      <div class="tile-sub">${data.bounces7d.toLocaleString("en-US")} bounced</div>
    </div>
    <div class="tile">
      <div class="tile-label">Replies · 7d</div>
      <div class="tile-value">${data.replies7d.toLocaleString("en-US")}</div>
      <div class="tile-sub">${(data.intentCounts.positive ?? 0).toLocaleString("en-US")} positive</div>
    </div>
    <div class="tile">
      <div class="tile-label">Reply rate · 7d</div>
      <div class="tile-value">${formatPercent(data.replies7d, data.sends7d)}</div>
      <div class="tile-sub">golden rule: scale at &gt;3%</div>
    </div>
    <div class="tile${pendingClass}">
      <div class="tile-label">Awaiting approval</div>
      <div class="tile-value" id="pending-count">${data.pendingCount}</div>
      <div class="tile-sub">${data.pendingCount > 0 ? "drafts need a decision" : "inbox zero"}</div>
    </div>
  </section>`;
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

function renderQueue(data: DashboardData, now: Date) {
  const cards = data.drafts.map((draft) => renderDraftCard(draft, now)).join("\n");
  const empty = `
    <div class="empty">
      <div class="empty-mark">✓</div>
      <p>Nothing waiting. New replies land here within ~5 minutes of arriving.</p>
    </div>`;
  return `
  <section class="queue reveal" style="--d:1">
    <h2>Approval queue <span class="count mono">${data.drafts.length}</span></h2>
    ${data.drafts.length > 0 ? cards : empty}
  </section>`;
}

function renderIntentMix(data: DashboardData) {
  const entries = INTENT_ORDER.map((intent) => ({ intent, count: data.intentCounts[intent] ?? 0 })).filter(
    (entry) => entry.count > 0
  );
  if (entries.length === 0) {
    return `<p class="muted">No classified replies in the last 7 days.</p>`;
  }
  const max = Math.max(...entries.map((entry) => entry.count));
  return entries
    .map(
      (entry) => `
      <div class="mix-row">
        <span class="mix-label">${intentBadge(entry.intent)}</span>
        <span class="mix-track"><span class="mix-bar" style="width:${Math.max(4, Math.round((entry.count / max) * 100))}%"></span></span>
        <span class="mix-count mono">${entry.count}</span>
      </div>`
    )
    .join("\n");
}

function renderDailyTable(data: DashboardData) {
  if (data.daily.length === 0) {
    return `<p class="muted">No metrics yet — the nightly rollup fills this in once sending starts.</p>`;
  }
  const rows = data.daily
    .map(
      (day) => `
      <tr>
        <td class="mono">${escapeHtml(day.date.slice(5))}</td>
        <td class="mono num">${day.sends}</td>
        <td class="mono num">${day.replies}</td>
        <td class="mono num">${day.bounces}</td>
      </tr>`
    )
    .join("\n");
  return `
    <div class="table-scroll">
      <table>
        <thead><tr><th>Date</th><th class="num">Sent</th><th class="num">Replies</th><th class="num">Bounces</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderFeed(data: DashboardData, now: Date) {
  if (data.feed.length === 0) {
    return `<p class="muted">No replies classified yet.</p>`;
  }
  return data.feed
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
}

function renderActivity(data: DashboardData, now: Date) {
  if (data.activity.length === 0) {
    return `<p class="muted">No approvals or rejections yet.</p>`;
  }
  return data.activity
    .map(
      (row) => `
      <div class="log-row mono">
        <span class="log-action log-${escapeHtml(row.action)}">${escapeHtml(row.action)}</span>
        <span>${escapeHtml(whoLabel(row.companyName, row.email))}</span>
        <span class="muted">${relativeTime(row.createdAt, now)}</span>
      </div>`
    )
    .join("\n");
}

export function renderDashboardPage(data: DashboardData) {
  const now = data.generatedAt;
  const updatedLabel = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const agentChip = data.agentPaused
    ? `<span class="chip chip-paused"><span class="dot"></span>agent paused</span>`
    : `<span class="chip chip-live"><span class="dot"></span>agent running</span>`;
  const failedChip = data.failedJobs > 0 ? `<span class="chip chip-warn">${data.failedJobs} failed job${data.failedJobs === 1 ? "" : "s"}</span>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Kinta · Outbound Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root {
    --paper: #f3f1ea;
    --surface: #fcfcfb;
    --ink: #141410;
    --ink-2: #52514e;
    --muted: #898781;
    --hairline: #e1e0d9;
    --accent: #1c5cab;
    --bar: #2a78d6;
    --approve: #006300;
    --danger: #a32c2c;
    --warn-bg: #faf0d6;
    --sans: "Archivo", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    background-image: radial-gradient(rgba(20, 20, 16, 0.045) 1px, transparent 1px);
    background-size: 22px 22px;
    color: var(--ink);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.5;
  }
  .mono { font-family: var(--mono); font-size: 12px; }
  .muted { color: var(--muted); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  .topbar {
    background: var(--ink);
    color: var(--paper);
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    align-items: center;
    justify-content: space-between;
    padding: 14px 22px;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand { font-family: var(--mono); font-weight: 600; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; }
  .brand em { color: #9ec5f4; font-style: normal; }
  .statusline { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chip {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(252,252,251,0.25);
  }
  .chip .dot { width: 7px; height: 7px; border-radius: 50%; }
  .chip-live .dot { background: #35c06f; animation: pulse 2.4s ease-in-out infinite; }
  .chip-paused { border-color: #fab219; color: #fad98a; }
  .chip-paused .dot { background: #fab219; }
  .chip-warn { border-color: #ec835a; color: #f5b399; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
  .topbar .mono.updated { color: rgba(252,252,251,0.55); font-size: 11px; }
  .btn-ghost-light {
    background: transparent; color: var(--paper); border: 1px solid rgba(252,252,251,0.35);
    font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 5px 12px; border-radius: 999px; cursor: pointer;
  }
  .btn-ghost-light:hover { border-color: var(--paper); }

  main { max-width: 1180px; margin: 0 auto; padding: 26px 22px 60px; }

  .reveal { animation: rise 0.45s cubic-bezier(0.2, 0.7, 0.3, 1) both; animation-delay: calc(var(--d, 0) * 90ms); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 26px; }
  .tile {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px;
    padding: 16px 18px 14px;
    box-shadow: 0 1px 2px rgba(20,20,16,0.04);
  }
  .tile-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .tile-value { font-family: var(--mono); font-weight: 600; font-size: 38px; line-height: 1.15; margin-top: 6px; }
  .tile-sub { font-size: 12.5px; color: var(--ink-2); margin-top: 2px; }
  .tile-attention { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(42,120,214,0.12); }
  .tile-attention .tile-value { color: var(--accent); }

  .cols { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 26px; align-items: start; }
  .cols > * { min-width: 0; }
  .card, .feed-row { overflow-wrap: anywhere; }

  h2 {
    font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
    margin: 0 0 12px; display: flex; align-items: baseline; gap: 10px;
    border-bottom: 2px solid var(--ink); padding-bottom: 8px;
  }
  h2 .count { color: var(--muted); font-weight: 500; }
  aside section { margin-bottom: 30px; }

  .card {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px;
    padding: 18px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(20,20,16,0.04);
    transition: opacity 0.35s ease, transform 0.35s ease;
  }
  .card.card-done { opacity: 0; transform: translateX(14px); }
  .card-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .card-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
  .card-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .badge {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  }
  .section-label {
    display: block; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 4px;
  }
  .prospect { margin-top: 14px; }
  .prospect blockquote {
    margin: 0; padding: 10px 14px; border-left: 3px solid var(--hairline);
    background: #f7f6f1; border-radius: 0 8px 8px 0;
    max-height: 180px; overflow-y: auto; white-space: pre-wrap; font-size: 14px;
  }
  .agent-note { margin-top: 12px; font-size: 13px; color: var(--ink-2); }
  .agent-note .section-label { display: inline; margin-right: 6px; }
  .field { display: block; margin-top: 12px; }
  .field input, .field textarea {
    width: 100%; border: 1px solid var(--hairline); border-radius: 8px;
    background: #fff; padding: 9px 12px; font: inherit; font-size: 14px; color: var(--ink);
  }
  .field textarea { resize: vertical; line-height: 1.55; }
  .field input:focus, .field textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
  .card-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .btn {
    font-family: var(--mono); font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    border-radius: 8px; padding: 9px 16px; cursor: pointer; border: 1px solid transparent;
  }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-approve { background: var(--approve); color: #fff; }
  .btn-approve:hover:not(:disabled) { background: #005200; }
  .btn-reject { background: transparent; color: var(--danger); border-color: var(--danger); }
  .btn-reject:hover:not(:disabled) { background: #fbe3e3; }
  .send-note { color: var(--muted); font-size: 11px; }
  .warn-text { color: #8a6400; background: var(--warn-bg); padding: 2px 6px; border-radius: 4px; }
  .action-status { font-size: 11px; }
  .action-status.err { color: var(--danger); }
  .action-status.ok { color: var(--approve); }

  .empty {
    background: var(--surface); border: 1px dashed var(--hairline); border-radius: 10px;
    padding: 36px 20px; text-align: center; color: var(--muted);
  }
  .empty-mark {
    font-family: var(--mono); font-size: 28px; color: var(--approve);
    width: 52px; height: 52px; line-height: 52px; margin: 0 auto 10px;
    border: 1px solid var(--hairline); border-radius: 50%; background: #f0f6f0;
  }

  .mix-row { display: grid; grid-template-columns: 118px 1fr 34px; align-items: center; gap: 10px; margin-bottom: 9px; }
  .mix-track { display: block; height: 8px; border-radius: 4px; background: transparent; }
  .mix-bar { display: block; height: 8px; border-radius: 4px; background: var(--bar); }
  .mix-count { text-align: right; }

  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--muted); font-weight: 500;
    padding: 4px 8px 6px; border-bottom: 1px solid var(--hairline);
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--hairline); }
  tr:last-child td { border-bottom: none; }

  .feed-row { padding: 10px 0; border-bottom: 1px solid var(--hairline); }
  .feed-row:last-child { border-bottom: none; }
  .feed-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; }
  .feed-reason { font-size: 12.5px; margin-top: 3px; }

  .log-row { display: flex; gap: 10px; align-items: baseline; padding: 6px 0; font-size: 12px; }
  .log-action { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .log-approved, .log-edited { color: var(--approve); }
  .log-rejected { color: var(--danger); }

  footer.page-foot { text-align: center; color: var(--muted); font-family: var(--mono); font-size: 11px; padding: 20px; }

  @media (max-width: 920px) {
    .cols { grid-template-columns: 1fr; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .tile-value { font-size: 30px; }
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">Kinta <em>·</em> Outbound Console</div>
  <div class="statusline">
    ${agentChip}
    ${failedChip}
    <button class="btn-ghost-light" id="pause-btn" data-paused="${data.agentPaused}">${data.agentPaused ? "Resume agent" : "Pause agent"}</button>
    <span class="mono updated">updated ${updatedLabel}</span>
  </div>
</header>
<main>
  ${renderKpis(data)}
  <div class="cols">
    <div>
      ${renderQueue(data, now)}
    </div>
    <aside class="reveal" style="--d:2">
      <section>
        <h2>Reply mix · 7d</h2>
        ${renderIntentMix(data)}
      </section>
      <section>
        <h2>Last 7 days</h2>
        ${renderDailyTable(data)}
      </section>
      <section>
        <h2>Reply feed</h2>
        ${renderFeed(data, now)}
      </section>
      <section>
        <h2>Recent actions</h2>
        ${renderActivity(data, now)}
      </section>
    </aside>
  </div>
</main>
<footer class="page-foot">refreshes every 60s while idle · pauses while you're editing</footer>
<script>
(function () {
  var dirty = false;
  document.addEventListener("input", function (event) {
    if (event.target.closest && event.target.closest(".card")) dirty = true;
  });
  setInterval(function () {
    if (!dirty && document.visibilityState === "visible") location.reload();
  }, 60000);

  function setStatus(card, message, kind) {
    var el = card.querySelector(".action-status");
    el.textContent = message;
    el.className = "action-status mono" + (kind ? " " + kind : "");
  }

  function enableButtons(card) {
    card.querySelectorAll("button[data-action]").forEach(function (b) {
      if (!b.hasAttribute("data-locked")) b.disabled = false;
    });
  }

  function finishCard(card) {
    card.classList.add("card-done");
    setTimeout(function () {
      card.remove();
      var counter = document.getElementById("pending-count");
      var remaining = document.querySelectorAll(".card[data-draft-id]").length;
      if (counter) counter.textContent = String(remaining);
      var queueCount = document.querySelector(".queue h2 .count");
      if (queueCount) queueCount.textContent = String(remaining);
    }, 380);
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var card = button.closest(".card");
    var action = button.getAttribute("data-action");
    var who = card.getAttribute("data-who") || "this lead";

    if (action === "approve" && !confirm("Send this reply to " + who + "?")) return;
    if (action === "reject" && !confirm("Reject this draft? Nothing will be sent.")) return;

    var payload = {};
    if (action === "approve") {
      payload.subject = card.querySelector("input[name=subject]").value;
      payload.body = card.querySelector("textarea[name=body]").value;
      if (!payload.body.trim()) { setStatus(card, "reply body is empty", "err"); return; }
    }

    card.querySelectorAll("button[data-action]").forEach(function (b) { b.disabled = true; });
    setStatus(card, action === "approve" ? "sending…" : "rejecting…");

    fetch("/dashboard/api/drafts/" + card.getAttribute("data-draft-id") + "/" + action, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
      .then(function (result) {
        if (result.ok) {
          setStatus(card, action === "approve" ? "sent ✓" : "rejected", "ok");
          finishCard(card);
        } else {
          setStatus(card, result.body && result.body.error ? result.body.error : "failed — try again", "err");
          enableButtons(card);
        }
      })
      .catch(function () {
        setStatus(card, "network error — try again", "err");
        enableButtons(card);
      });
  });

  var pauseButton = document.getElementById("pause-btn");
  if (pauseButton) {
    pauseButton.addEventListener("click", function () {
      var paused = pauseButton.getAttribute("data-paused") === "true";
      var verb = paused ? "Resume" : "Pause";
      if (!confirm(verb + " the agent? " + (paused ? "It will start processing replies again." : "It will stop classifying and drafting until resumed."))) return;
      pauseButton.disabled = true;
      fetch("/dashboard/api/agent/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused: !paused })
      }).then(function (response) {
        if (response.ok) location.reload();
        else pauseButton.disabled = false;
      }).catch(function () { pauseButton.disabled = false; });
    });
  }
})();
</script>
</body>
</html>`;
}

export function renderMessagePage(title: string, message: string, statusHint?: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f1ea; color: #141410; font-family: system-ui, sans-serif; }
  .box { max-width: 420px; padding: 32px; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { color: #52514e; font-size: 14px; line-height: 1.55; margin: 0; }
  .hint { margin-top: 14px; font-family: ui-monospace, monospace; font-size: 11px; color: #898781; letter-spacing: 0.08em; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="box">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${statusHint ? `<div class="hint">${escapeHtml(statusHint)}</div>` : ""}
  </div>
</body>
</html>`;
}
