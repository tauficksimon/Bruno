// Shared dashboard chrome: the shell (sidebar + topbar + agent dock), the
// design tokens, and the client-side JS. Page bodies come from pages.ts.
// Every dynamic string goes through escapeHtml — prospect-authored text is
// untrusted input (AUDIT-M5) and must never reach the page unescaped.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ShellContext {
  active: "bruno" | "inbox" | "campaign" | "system";
  title: string;
  pendingCount: number;
  failedJobs: number;
  agentPaused: boolean;
  generatedAt: Date;
  /** Reload every 60s while idle. Off for the chat page. */
  autoRefresh: boolean;
  /** Recent agent conversation, rendered into the floating dock (non-chat pages). */
  dockTurns?: ChatTurn[];
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tinted badge + dark text per intent. The label text always spells the intent,
// so color never carries the meaning alone.
const INTENT_STYLES: Record<string, { bg: string; fg: string }> = {
  positive: { bg: "#e0f3e0", fg: "#006300" },
  question: { bg: "#e8e9fc", fg: "#1b1fd1" },
  objection: { bg: "#fdeadd", fg: "#a34a17" },
  not_now: { bg: "#efeee8", fg: "#52514e" },
  negative: { bg: "#fbe3e3", fg: "#a32c2c" },
  unsubscribe: { bg: "#f3e0e0", fg: "#7c2222" },
  unclear: { bg: "#faf0d6", fg: "#8a6400" }
};

export function intentBadge(intent: string) {
  const style = INTENT_STYLES[intent] ?? INTENT_STYLES.unclear;
  const label = intent.replace("_", " ");
  return `<span class="badge" style="background:${style.bg};color:${style.fg}">${escapeHtml(label)}</span>`;
}

export function relativeTime(iso: string, now: Date) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function whoLabel(companyName?: string, email?: string) {
  return companyName?.trim() || email?.trim() || "Unknown lead";
}

export function renderChatTurns(turns: ChatTurn[], emptyHtml: string) {
  if (turns.length === 0) {
    return emptyHtml;
  }
  return turns
    .map((turn) =>
      turn.role === "user"
        ? `<div class="msg msg-user">${escapeHtml(turn.content)}</div>`
        : `<div class="msg msg-agent"><div class="msg-tag">bruno</div>${escapeHtml(turn.content)}</div>`
    )
    .join("\n");
}

const NAV_ITEMS: Array<{ key: ShellContext["active"]; href: string; label: string }> = [
  { key: "bruno", href: "/dashboard", label: "Bruno" },
  { key: "inbox", href: "/dashboard/inbox", label: "Inbox" },
  { key: "campaign", href: "/dashboard/campaign", label: "Campaign" },
  { key: "system", href: "/dashboard/system", label: "System" }
];

function navCount(item: ShellContext["active"], ctx: ShellContext) {
  if (item === "inbox" && ctx.pendingCount > 0) return `<span class="nav-count">${ctx.pendingCount}</span>`;
  if (item === "system" && ctx.failedJobs > 0) return `<span class="nav-count nav-count-bad">${ctx.failedJobs}</span>`;
  return "";
}

function renderDock(ctx: ShellContext) {
  if (ctx.active === "bruno" || !ctx.dockTurns) return "";
  return `
  <button class="dock-toggle" id="dock-toggle" aria-label="Chat with Bruno">✳ <span>Bruno</span></button>
  <div class="dock" id="dock" hidden>
    <div class="dock-head">
      <span class="mono">BRUNO</span>
      <a class="dock-expand mono" href="/dashboard">full view ↗</a>
      <button class="dock-close" id="dock-close" aria-label="Close">×</button>
    </div>
    <div class="chat" data-chat>
      <div class="chat-scroll" data-chat-scroll>
        ${renderChatTurns(ctx.dockTurns.slice(-8), `<div class="chat-empty muted">Ask Bruno anything — campaign numbers, inbox health, a draft…</div>`)}
      </div>
      <form class="composer" data-chat-form>
        <textarea name="message" rows="2" placeholder="Ask Bruno…" required></textarea>
        <button class="btn btn-send" type="submit">Send</button>
      </form>
    </div>
  </div>`;
}

export function renderShell(ctx: ShellContext, contentHtml: string) {
  const updatedLabel = ctx.generatedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const agentChip = ctx.agentPaused
    ? `<span class="chip chip-paused"><span class="dot"></span>paused</span>`
    : `<span class="chip chip-live"><span class="dot"></span>running</span>`;
  const failedChip =
    ctx.failedJobs > 0
      ? `<a class="chip chip-warn" href="/dashboard/system">${ctx.failedJobs} failed job${ctx.failedJobs === 1 ? "" : "s"}</a>`
      : "";
  const navHtml = NAV_ITEMS.map(
    (item) =>
      `<a class="nav-item${item.key === ctx.active ? " nav-active" : ""}" href="${item.href}">${item.label}${navCount(item.key, ctx)}</a>`
  ).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Kinta · ${escapeHtml(ctx.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  /* Kinta brand tokens — matches kinta-latam.web.app */
  :root {
    --paper: #f5f5f7;
    --surface: #ffffff;
    --ink: #1a1a1a;
    --ink-2: #4b5563;
    --muted: #6b7280;
    --hairline: #e5e7eb;
    --accent: #1b1fd1;
    --accent-deep: #0d0e6b;
    --accent-soft: #e8e9fc;
    --accent-mid: #8b8fe8;
    --bar: #1b1fd1;
    --cta: #f04e23;
    --cta-hover: #d83b12;
    --ok: #0b802b;
    --ok-soft: #e7f8ec;
    --danger: #991b1b;
    --danger-soft: #fee2e2;
    --warn-bg: #fef0eb;
    --warn-text: #7a2800;
    --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    --display: "Outfit", var(--sans);
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    background-image: radial-gradient(rgba(26, 26, 26, 0.04) 1px, transparent 1px);
    background-size: 22px 22px;
    color: var(--ink);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.5;
    display: flex;
    min-height: 100vh;
  }
  h1, h2, h3, .brand { font-family: var(--display); }
  .mono { font-family: var(--mono); font-size: 12px; }
  .muted { color: var(--muted); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }

  /* ——— Sidebar ——— */
  .side {
    width: 212px; flex: 0 0 212px;
    background: var(--accent-deep); color: #fff;
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh;
  }
  .brand {
    font-weight: 800; font-size: 17px; letter-spacing: 0.01em;
    padding: 20px 18px 16px; line-height: 1.3;
  }
  .brand em { color: var(--accent-mid); font-style: normal; }
  .brand small { display: block; font-family: var(--mono); font-weight: 500; color: rgba(255,255,255,0.45); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 3px; }
  .nav { display: flex; flex-direction: column; padding: 8px 10px; gap: 2px; }
  .nav-item {
    display: flex; align-items: center; justify-content: space-between;
    color: rgba(255,255,255,0.72); text-decoration: none;
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
    padding: 10px 12px; border-radius: 8px; border-left: 2px solid transparent;
  }
  .nav-item:hover { color: #fff; background: rgba(255,255,255,0.07); }
  .nav-active { color: #fff; background: rgba(255,255,255,0.11); border-left-color: var(--cta); }
  .nav-count {
    font-size: 10px; background: var(--accent-mid); color: var(--accent-deep);
    border-radius: 999px; padding: 1px 7px; font-weight: 600;
  }
  .nav-count-bad { background: var(--cta); color: #fff; }
  .side-foot { margin-top: auto; padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 10px; }
  .chip {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 7px; width: fit-content;
    padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.3);
    color: rgba(255,255,255,0.88); text-decoration: none;
  }
  .chip .dot { width: 7px; height: 7px; border-radius: 50%; }
  .chip-live .dot { background: #28c840; animation: pulse 2.4s ease-in-out infinite; }
  .chip-paused { border-color: #ffbd2e; color: #ffd88a; }
  .chip-paused .dot { background: #ffbd2e; }
  .chip-warn { border-color: var(--cta); color: #ffb59e; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
  .btn-ghost-light {
    background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.4);
    font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 6px 12px; border-radius: 999px; cursor: pointer; width: fit-content;
  }
  .btn-ghost-light:hover { border-color: #fff; }
  .side-updated { color: rgba(255,255,255,0.4); font-size: 10px; }
  /* Topbar chips sit on the light content background */
  .topbar .chip { border-color: var(--hairline); color: var(--ink-2); background: var(--surface); }
  .topbar .chip-paused { border-color: #ffbd2e; color: var(--warn-text); }
  .topbar .chip-warn { border-color: var(--cta); color: var(--cta-hover); }

  /* ——— Content column ——— */
  .content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .topbar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 16px 26px 0; max-width: 1012px; width: 100%; margin: 0 auto;
  }
  .topbar h1 { font-size: 20px; font-weight: 800; letter-spacing: -0.01em; margin: 0; margin-right: auto; }
  main { padding: 18px 26px 60px; max-width: 1012px; width: 100%; margin: 0 auto; }
  main.main-chat { flex: 1; display: flex; flex-direction: column; padding-bottom: 24px; max-width: 880px; }

  .reveal { animation: rise 0.45s cubic-bezier(0.2, 0.7, 0.3, 1) both; animation-delay: calc(var(--d, 0) * 90ms); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  h2 {
    font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
    margin: 22px 0 12px; display: flex; align-items: baseline; gap: 10px;
    border-bottom: 2px solid var(--ink); padding-bottom: 8px;
  }
  h2:first-child { margin-top: 0; }
  h2 .count { color: var(--muted); font-weight: 500; }

  /* ——— Tiles ——— */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 10px; }
  .kpis-3 { grid-template-columns: repeat(3, 1fr); }
  .tile {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px;
    padding: 16px 18px 14px; box-shadow: 0 1px 2px rgba(26,26,26,0.04); min-width: 0;
  }
  .tile-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .tile-value { font-family: var(--display); font-weight: 800; font-size: 36px; line-height: 1.15; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .tile-sub { font-size: 12.5px; color: var(--ink-2); margin-top: 2px; }
  .tile-attention { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(27,31,209,0.10); }
  .tile-attention .tile-value { color: var(--accent); }
  .tile-bad { border-color: var(--cta); box-shadow: 0 0 0 3px rgba(240,78,35,0.10); }
  .tile-bad .tile-value { color: var(--cta-hover); }

  /* ——— Cards (approvals) ——— */
  .card {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px;
    padding: 18px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(26,26,26,0.04);
    transition: opacity 0.35s ease, transform 0.35s ease; overflow-wrap: anywhere;
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
    margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent-mid);
    background: var(--accent-soft); border-radius: 0 8px 8px 0;
    max-height: 180px; overflow-y: auto; white-space: pre-wrap; font-size: 14px;
    overflow-wrap: anywhere;
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
  .btn-approve { background: var(--cta); color: #fff; }
  .btn-approve:hover:not(:disabled) { background: var(--cta-hover); }
  .btn-reject { background: transparent; color: var(--danger); border-color: var(--danger); }
  .btn-reject:hover:not(:disabled) { background: var(--danger-soft); }
  .btn-plain { background: var(--surface); color: var(--ink); border-color: var(--hairline); }
  .btn-plain:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .send-note { color: var(--muted); font-size: 11px; }
  .warn-text { color: var(--warn-text); background: var(--warn-bg); padding: 2px 6px; border-radius: 4px; }
  .action-status { font-size: 11px; }
  .action-status.err { color: var(--danger); }
  .action-status.ok { color: var(--ok); }

  .empty {
    background: var(--surface); border: 1px dashed var(--hairline); border-radius: 10px;
    padding: 36px 20px; text-align: center; color: var(--muted);
  }
  .empty-mark {
    font-family: var(--mono); font-size: 28px; color: var(--ok);
    width: 52px; height: 52px; line-height: 52px; margin: 0 auto 10px;
    border: 1px solid var(--hairline); border-radius: 50%; background: var(--ok-soft);
  }

  /* ——— Lists & tables ——— */
  .mix-row { display: grid; grid-template-columns: 118px 1fr 34px; align-items: center; gap: 10px; margin-bottom: 9px; }
  .mix-track { display: block; height: 8px; border-radius: 4px; }
  .mix-bar { display: block; height: 8px; border-radius: 4px; background: var(--bar); }
  .mix-count { text-align: right; }
  .table-scroll { overflow-x: auto; background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px; padding: 6px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--muted); font-weight: 500;
    padding: 8px 8px 6px; border-bottom: 1px solid var(--hairline);
  }
  td { padding: 8px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .feed-row { padding: 10px 0; border-bottom: 1px solid var(--hairline); overflow-wrap: anywhere; }
  .feed-row:last-child { border-bottom: none; }
  .feed-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; }
  .feed-reason { font-size: 12.5px; margin-top: 3px; }
  .log-row { display: flex; gap: 10px; align-items: baseline; padding: 6px 0; font-size: 12px; }
  .log-action { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .log-approved, .log-edited { color: var(--ok); }
  .log-rejected { color: var(--danger); }
  .err-detail {
    font-family: var(--mono); font-size: 11px; color: var(--danger);
    background: var(--danger-soft); border-radius: 6px; padding: 6px 9px; margin-top: 6px;
    overflow-wrap: anywhere; max-width: 640px;
  }

  /* ——— Chat ——— */
  .chat { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .chat-scroll { flex: 1; overflow-y: auto; padding: 4px 2px; display: flex; flex-direction: column; gap: 12px; }
  .chat-empty { text-align: center; padding: 26px 12px; font-size: 13px; }
  .chat-welcome { margin: auto; text-align: center; padding: 20px; max-width: 460px; }
  .bruno-mark {
    width: 72px; height: 72px; line-height: 72px; margin: 0 auto 18px;
    border-radius: 50%; background: var(--accent); color: #fff;
    font-size: 30px; box-shadow: 0 10px 30px rgba(27,31,209,0.3);
  }
  .chat-welcome h2 { border: none; margin: 0 0 8px; padding: 0; font-size: 26px; font-weight: 800; display: block; }
  .chat-welcome p { color: var(--muted); font-size: 14.5px; margin: 0; }
  .msg { max-width: 72%; padding: 11px 15px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14.5px; }
  .msg-user { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
  .msg-agent {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--hairline);
    border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(26,26,26,0.04);
  }
  .msg-tag { font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .msg-tag::before { content: "✳ "; color: var(--accent); }
  .msg-tools { font-family: var(--mono); font-size: 10.5px; color: var(--muted); margin-top: 8px; }
  .msg-pending .dots span { animation: blink 1.2s infinite; }
  .msg-pending .dots span:nth-child(2) { animation-delay: 0.2s; }
  .msg-pending .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%,100% { opacity: 0.2 } 50% { opacity: 1 } }
  .composer {
    display: flex; gap: 10px; align-items: flex-end; margin-top: 14px;
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px;
    padding: 8px 8px 8px 16px; box-shadow: 0 8px 28px rgba(13,14,107,0.07);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .composer:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft), 0 8px 28px rgba(13,14,107,0.07); }
  .composer textarea {
    flex: 1; border: none; background: transparent; outline: none;
    padding: 8px 0; font: inherit; font-size: 14.5px; resize: none; max-height: 140px;
  }
  .btn-send { background: var(--accent); color: #fff; border-radius: 11px; padding: 12px 18px; }
  .btn-send:hover:not(:disabled) { background: #171887; }
  .suggestions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
  .suggestion {
    font-family: var(--mono); font-size: 11px; color: var(--ink-2);
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 999px;
    padding: 6px 12px; cursor: pointer;
  }
  .suggestion:hover { border-color: var(--accent); color: var(--accent); }

  /* ——— Dock ——— */
  .dock-toggle {
    position: fixed; right: 20px; bottom: 20px; z-index: 40;
    background: var(--accent); color: #fff; border: none; cursor: pointer;
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 12px 18px; border-radius: 999px; box-shadow: 0 6px 20px rgba(13,14,107,0.4);
  }
  .dock-toggle:hover { background: #171887; }
  .dock {
    position: fixed; right: 20px; bottom: 20px; z-index: 41;
    width: 360px; max-width: calc(100vw - 24px); height: 500px; max-height: calc(100vh - 40px);
    background: var(--paper); border: 1px solid var(--accent-deep); border-radius: 14px;
    box-shadow: 0 16px 44px rgba(13,14,107,0.35);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .dock[hidden] { display: none; }
  .dock-head {
    background: var(--accent-deep); color: #fff;
    display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  }
  .dock-head .mono { letter-spacing: 0.16em; }
  .dock-expand { color: var(--accent-mid); text-decoration: none; margin-left: auto; }
  .dock-close { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; line-height: 1; }
  .dock .chat { padding: 12px; }
  .dock .msg { max-width: 88%; font-size: 13.5px; }
  .dock .composer { margin-top: 10px; }
  .dock .composer textarea { padding: 9px 12px; font-size: 13.5px; }
  .dock .btn-send { padding: 10px 14px; }

  footer.page-foot { text-align: center; color: var(--muted); font-family: var(--mono); font-size: 11px; padding: 14px; }

  /* ——— Briefing (home) ——— */
  .briefing {
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px;
    padding: 14px 18px 12px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(26,26,26,0.04);
  }
  .briefing-title { font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .briefing-row { display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; padding: 4px 0; overflow-wrap: anywhere; }
  .briefing-row a { color: var(--accent); text-decoration: none; font-weight: 600; white-space: nowrap; }
  .briefing-row a:hover { text-decoration: underline; }
  .b-flag {
    flex: 0 0 auto; font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  }
  .b-flag.b-hot { background: var(--warn-bg); color: var(--cta-hover); }
  .b-flag.b-warn { background: var(--danger-soft); color: var(--danger); }
  .b-flag.b-ok { background: var(--ok-soft); color: var(--ok); }

  /* ——— System status hero ——— */
  .status-hero {
    display: flex; gap: 16px; align-items: flex-start;
    background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px;
    padding: 20px; font-size: 15px; box-shadow: 0 1px 2px rgba(26,26,26,0.04);
  }
  .status-mark {
    flex: 0 0 auto; width: 44px; height: 44px; line-height: 44px; text-align: center;
    border-radius: 50%; font-family: var(--mono); font-size: 22px; font-weight: 600;
  }
  .status-ok { border-color: var(--ok); }
  .status-ok .status-mark { background: var(--ok-soft); color: var(--ok); }
  .status-bad { border-color: var(--cta); }
  .status-bad .status-mark { background: var(--warn-bg); color: var(--cta-hover); }
  details.tech { margin-top: 22px; }
  details.tech > summary {
    cursor: pointer; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase;
    padding: 6px 0; user-select: none;
  }
  details.tech > summary:hover { color: var(--accent); }

  @media (max-width: 880px) {
    body { flex-direction: column; }
    .side { width: 100%; flex: none; height: auto; position: static; }
    .nav { flex-direction: row; overflow-x: auto; padding: 0 10px 10px; }
    .nav-item { white-space: nowrap; gap: 8px; border-left: none; border-bottom: 2px solid transparent; border-radius: 8px 8px 0 0; }
    .nav-active { border-bottom-color: var(--cta); }
    .side-foot { display: none; }
    .kpis, .kpis-3 { grid-template-columns: repeat(2, 1fr); }
    .tile-value { font-size: 28px; }
    .msg { max-width: 88%; }
    main { padding: 14px 16px 60px; }
    .topbar { padding: 14px 16px 0; }
  }
</style>
</head>
<body data-autorefresh="${ctx.autoRefresh ? "1" : "0"}">
<aside class="side">
  <div class="brand">Bruno<small>Kinta <em>·</em> outbound</small></div>
  <nav class="nav">
    ${navHtml}
  </nav>
  <div class="side-foot">
    ${agentChip}
    ${failedChip}
    <button class="btn-ghost-light" id="pause-btn" data-paused="${ctx.agentPaused}">${ctx.agentPaused ? "Resume Bruno" : "Pause Bruno"}</button>
    <span class="mono side-updated">updated ${updatedLabel}</span>
  </div>
</aside>
<div class="content">
  <div class="topbar">
    <h1>${escapeHtml(ctx.title)}</h1>
    ${failedChip}
    ${agentChip}
  </div>
  ${contentHtml}
</div>
${renderDock(ctx)}
<script>
(function () {
  var dirty = false;
  var chatBusy = false;
  document.addEventListener("input", function () { dirty = true; });
  if (document.body.getAttribute("data-autorefresh") === "1") {
    setInterval(function () {
      var dockOpen = document.getElementById("dock") && !document.getElementById("dock").hidden;
      if (!dirty && !chatBusy && !dockOpen && document.visibilityState === "visible") location.reload();
    }, 60000);
  }

  /* ——— Agent chat (full page and dock share this) ——— */
  function appendMsg(scroll, cls, text, tag, tools) {
    var el = document.createElement("div");
    el.className = "msg " + cls;
    if (tag) {
      var t = document.createElement("div");
      t.className = "msg-tag";
      t.textContent = tag;
      el.appendChild(t);
    }
    el.appendChild(document.createTextNode(text));
    if (tools && tools.length) {
      var tl = document.createElement("div");
      tl.className = "msg-tools";
      tl.textContent = "↳ checked: " + tools.join(", ");
      el.appendChild(tl);
    }
    var empty = scroll.querySelector(".chat-empty");
    if (empty) empty.remove();
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
    return el;
  }

  document.querySelectorAll("[data-chat-form]").forEach(function (form) {
    var chat = form.closest("[data-chat]");
    var scroll = chat.querySelector("[data-chat-scroll]");
    var textarea = form.querySelector("textarea");
    scroll.scrollTop = scroll.scrollHeight;

    textarea.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var message = textarea.value.trim();
      if (!message || chatBusy) return;
      chatBusy = true;
      textarea.value = "";
      form.querySelector("button").disabled = true;
      appendMsg(scroll, "msg-user", message);
      var pending = appendMsg(scroll, "msg-agent msg-pending", "", "bruno");
      pending.insertAdjacentHTML("beforeend", '<span class="dots"><span>●</span> <span>●</span> <span>●</span></span>');

      fetch("/dashboard/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: message })
      })
        .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
        .then(function (result) {
          pending.remove();
          if (result.ok) {
            appendMsg(scroll, "msg-agent", result.body.text, "bruno", result.body.toolCalls);
          } else {
            appendMsg(scroll, "msg-agent", (result.body && result.body.error) || "Something went wrong — try again.", "bruno");
          }
        })
        .catch(function () {
          pending.remove();
          appendMsg(scroll, "msg-agent", "Network error — try again.", "bruno");
        })
        .finally(function () {
          chatBusy = false;
          form.querySelector("button").disabled = false;
          textarea.focus();
        });
    });
  });

  document.querySelectorAll(".suggestion").forEach(function (button) {
    button.addEventListener("click", function () {
      var form = document.querySelector("[data-chat-form]");
      form.querySelector("textarea").value = button.textContent;
      form.requestSubmit();
    });
  });

  var toggle = document.getElementById("dock-toggle");
  var dock = document.getElementById("dock");
  if (toggle && dock) {
    toggle.addEventListener("click", function () {
      dock.hidden = false;
      toggle.hidden = true;
      var scroll = dock.querySelector("[data-chat-scroll]");
      scroll.scrollTop = scroll.scrollHeight;
      dock.querySelector("textarea").focus();
    });
    document.getElementById("dock-close").addEventListener("click", function () {
      dock.hidden = true;
      toggle.hidden = false;
    });
  }

  /* ——— Approvals ——— */
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
      var remaining = document.querySelectorAll(".card[data-draft-id]").length;
      var counter = document.getElementById("pending-count");
      if (counter) counter.textContent = String(remaining);
      var queueCount = document.querySelector("h2 .count");
      if (queueCount) queueCount.textContent = String(remaining);
    }, 380);
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var card = button.closest(".card");
    if (!card) return;
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

  /* ——— Operations ——— */
  document.querySelectorAll("button[data-ops]").forEach(function (button) {
    button.addEventListener("click", function () {
      var op = button.getAttribute("data-ops");
      var name = button.getAttribute("data-job-name") || undefined;
      var label = name || "ALL job types";
      var message = op === "retry"
        ? "Re-run the most recent failed \\"" + label + "\\" job now?"
        : "Clear failed jobs for " + label + "? This deletes their failure records (the schedules keep running).";
      if (!confirm(message)) return;
      button.disabled = true;
      fetch("/dashboard/api/ops/" + op, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name })
      }).then(function (response) {
        if (response.ok) location.reload();
        else { button.disabled = false; alert("Action failed — try again."); }
      }).catch(function () { button.disabled = false; alert("Network error — try again."); });
    });
  });

  /* ——— Pause toggle ——— */
  var pauseButton = document.getElementById("pause-btn");
  if (pauseButton) {
    pauseButton.addEventListener("click", function () {
      var paused = pauseButton.getAttribute("data-paused") === "true";
      var verb = paused ? "Resume" : "Pause";
      if (!confirm(verb + " Bruno? " + (paused ? "He will start processing replies again." : "He will stop classifying and drafting until resumed."))) return;
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
