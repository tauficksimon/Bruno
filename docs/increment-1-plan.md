# Increment 1 — "Operate": full build plan

_2026-07-14. Companion to `console-operations-audit.md`. Scope: everything the
console needs so a 1–2 person team can run 5,000 emails/month from it —
# updates channel, lead dossier, search, Leads (CRM) view, Bruno's
`get_lead_history` tool, Inbox work-queue upgrades._

---

## 0. Design spine

The unit of the console is the **lead conversation**. One assembly function —
the **dossier** — joins everything known about one email address, and powers
three surfaces: the lead page (humans), the `get_lead_history` tool (Bruno),
and the search results. Instantly stays the source of truth for pipeline
state; Postgres holds Bruno's memory (classifications, drafts, edits,
suppressions, notes later).

```
                       ┌─ /dashboard/lead?email=…   (lead page)
getLeadDossier(email) ─┼─ get_lead_history tool     (Bruno chat)
                       └─ /dashboard/search results
Sources: Instantly lead record + full email thread + engagement (cached)
       + Postgres classifications/drafts/approvals/suppressions
```

---

## 1. # updates — Bruno's channel

**Data.** Reserved conversation thread `channel:updates` in
`agent_conversations`. No migration needed.

**Writers.** New `src/integrations/notify.ts` with `notifyDigest / notifyAlert
/ notifyHotReply / notifyAnalytics` — each appends an assistant turn to the
channel (kind-tagged: 📋 ⚠️ 🔥 📈) and falls through to the existing Slack
functions (which log to console when Slack is absent). Rewire the six posting
sites: processDailyDigest, processInstantlyEvent, processReplyPoll,
processWatchdog, processWeeklyAnalytics, queue/worker (terminal failures).
Alert-once semantics already dedupe repeat alerts; channel writes are
best-effort (never fail the posting job).

**Reader.** The chat page with `chatId=updates` (reserved id) maps to thread
`channel:updates`. Replies are allowed — the owner can ask "why did bounces
spike?" directly under the alert.

**Agent-history subtlety.** `loadConversation` trims *leading assistant turns*
(Claude requires a user turn first). A channel is mostly Bruno-first, so
replies would lose the feed as context. Fix: for the channel only, load
untrimmed and prepend a synthetic user turn `"[Bruno's updates feed follows]"`
when the history starts with an assistant turn.

**Sidebar.** New CHANNELS section above CHATS: `# updates` row with the latest
update's timestamp server-rendered as a data attribute; a small JS check
against `localStorage.lastSeen:updates` shows the unread dot and clears it on
visit. (No server-side user state exists — localStorage is honest here.)

---

## 2. Lead dossier

**New Instantly wrappers** (`integrations/instantly.ts`):
- `getLeadRecord(email, campaignId?)` — extends the engagement lookup to also
  return `first_name/last_name/company_name`, `lt_interest_status`, and the
  `payload` custom-field object (title, LinkedIn, anything imported).
- `listLeadEmails(leadEmail, limit≈50)` — `GET /api/v2/emails?lead=…` without
  an `email_type` filter, ascending: the full correspondence, each item tagged
  sent/received (existing `normalizeEmail` reused). ⚠ the `lead` query-param
  name needs one live read to confirm — flagged as a verification step.
- Interest-status label map (1 interested · 2 meeting booked · 3 meeting
  completed · 4 closed · -1 not interested · -2 wrong person · -3 lost;
  unknown numbers displayed raw, never guessed).

**New Postgres queries** (`db/dashboard.ts`):
- `getLeadActivity(email)` — all classifications (intent, confidence, reason,
  `suggested_next_action`, created_at), their drafts (status, original
  subject/body), approvals (action, `final_subject/final_body`, notes,
  created_at), and suppression_events, one round trip each.

**Assembly** (`routes.ts`): `getLeadDossier(email)` — Instantly parts cached
(5–15 min in cached_records), DB parts live, everything failure-tolerant (a
dead Instantly still renders the Postgres half).

**Page** `/dashboard/lead?email=…`:
- Header: name · company · email · interest badge · sequence badge ·
  engagement chips · custom fields from `payload` as quiet chips.
- Actions: "open in Inbox" (when a draft is pending) · "Set status" select →
  `POST /dashboard/api/lead/interest` (confirm-gated, writes
  `update-interest-status`, invalidates that lead's cache).
- **Timeline**: one merged, chronological stream — outbound emails (right,
  "us", subject + expandable body), inbound replies (left, "them", untrusted
  and escaped), Bruno annotations ("read as **positive** 93% — asks about
  pricing → *suggested: book a 20-min call*"), decisions ("approved · edited —
  original vs sent shown stacked"), suppressions ("added to do-not-contact —
  unsubscribe"). This stacked original-vs-sent view doubles as the trust/
  learning view the audit called for.
- Empty/unknown lead: graceful "nothing known yet" panel.

---

## 3. Search

- Sidebar search box (every page) → `GET /dashboard/search?q=…`.
- Server merges two sources, deduped by email: Postgres
  (`reply_classifications.email/company_name ILIKE`) and Instantly
  (`leads/list` with `search:q`, top 10). Each result: who · company · badges
  (pending draft? intent? interest?) · last activity → dossier link.
- Every lead name across Inbox / feeds / activity / channel becomes a dossier
  link, so search is rarely even needed for recent items.

---

## 4. Leads — the CRM view

**Route** `/dashboard/leads` (+ sidebar nav item between Inbox and Campaign).

- Pull: paginated `leads/list` for the campaign (100/page, cap 2,000), cached
  10 min. At the 5k/mo scale that's ~15 pages once per cache window.
- Table: name/company · email · interest badge · sequence status ·
  opens/clicks/replies · last contact · → dossier.
- Filter tabs (client-side over the rendered rows): All · Replied ·
  Interested+ · In sequence · Finished · Suppressed, plus a type-to-filter box.
  Render cap 1,000 rows with a "narrow the filter" note beyond.
- Pipeline changes happen on the dossier (Set status) — the table stays
  read-fast.

---

## 5. Bruno: `get_lead_history` tool

- New tool in `outboundAgent.ts`: input `{ email }` → compact dossier JSON:
  lead record + engagement, last ~8 thread items (subject + 400-char preview,
  prospect text under `untrusted_prospect_*` keys per the injection protocol),
  classifications with reasons, sent replies with whether they were edited.
- Purpose: "prep me for the call with Meridian" answered in chat, anywhere.
- Also listed in `docs/bruno-tools.md` "Now" section.

---

## 6. Inbox work-queue upgrades

- Query: pending drafts also select `rc.suggested_next_action`.
- Card additions:
  - **Bruno suggests:** the stored next action, displayed at last.
  - **SLA clock:** for hot intents, the age chip turns `--cta` red past 60
    minutes with "⏰ over the 1-hour mark" (the business's own benchmark).
  - **Context line:** "replying to email 2 · variant B · from alex@" (from the
    engagement lookup already fetched for cards).
  - Lead name → dossier link (also on needs-read cards and handled rows).

---

## 7. Verification plan (all local against dev DB + live read-only Instantly)

1. Trigger `daily.digest` manually → post appears in # updates; reply under it
   → Bruno answers citing the digest (proves the alternation fix).
2. Dossier on a **real** campaign lead (3 exist) — thread renders with
   sent-direction tags; then on a DASHTEST lead — Postgres-only dossier renders.
3. Search finds real lead by partial company; DASHTEST by email.
4. Leads page lists the 3 real leads with statuses; filters work.
5. `get_lead_history` via chat: "prep me on <real lead email>" → tool call +
   grounded answer.
6. Inbox: seed a 2-hour-old positive draft → red SLA; suggestion line renders.
7. Interest write: tested against the error path only (unknown email) — the
   happy path stays flagged **unverified-live** like `sendReplyEmail`, to be
   confirmed on first real use.
8. XSS re-check: prospect text in timeline and search results stays escaped.
9. Typecheck, build, screenshots (channel / dossier / leads / search / inbox),
   PR.

## 8. Explicitly out of scope (later increments)

Campaign pause/resume + throttle (Inc 2) · Resend email pings (Inc 2, needs
account + address) · mark-handled/snooze states (Inc 2) · CSV lead feeding +
scoring (Inc 3) · lessons & edit-diff analytics (Inc 3) · keyboard triage
(Inc 3) · multi-user roles (not planned).
