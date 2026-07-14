# Console Operations Audit — running 5,000 emails/month through Bruno

_2026-07-14. Question audited: is the console an actual operating tool — a control
center and a context center — for a 1–2 person team sending 5,000 cold emails a
month? Not "does it show metrics."_

## 1. The scale we're designing for

5,000 sends/month at a 5-step sequence means roughly:

| Quantity | Volume | Human meaning |
|---|---|---|
| New leads contacted | ~1,000–1,500/mo | feeds must be topped up weekly |
| Replies | ~40–80/mo, spiky | 2–4 decisions on a normal day, 10+ on a good one |
| Hot replies (positive/question/objection) | ~1–2/day | each worth real money; <1h response converts 10–20% to calls |
| Bounces at the 3% cap | ~150/mo | deliverability watch is constant |
| Sending inboxes needed | 8–12 at 20–30/day | health per-inbox matters, not just aggregate |

If the system works, the humans spend **5–15 minutes a day** in the console.
The console's whole job is to make those minutes decisive, and to make trust
possible so nobody feels the need to babysit Instantly.

## 2. The three duties of an operating console

**A. Work queue** — everything needing a human decision in one place, ordered by
money-urgency, decidable *inside the card*, gone when done.

**B. Context** — any lead's full story in under 10 seconds ("meeting in 10
minutes"); any number traceable; "prep me" answerable in chat.

**C. Command** — the levers: pause/resume Bruno *and the campaign*, throttle,
feed leads, fix failures, teach. Routine ops should never require opening
Instantly.

(Implicit fourth: **Trust** — the console must show what Bruno did on his own
and why, or the human re-checks everything and the tool fails.)

## 3. Audit findings

### Duty A — work queue: 60% there
✅ Inbox: hottest-first cards, edit-in-place approve, atomic no-double-send,
needs-your-read, handled-for-you, activity log.
❌ **No SLA signal.** Age is shown but not judged against the <1h benchmark that
the whole business case rests on.
❌ **`suggested_next_action` is stored on every classification and never
displayed.** Bruno already says what to do next; the UI throws it away.
❌ **Cards lack outbound context.** You see their reply but not what we sent
them (which email, which A/B variant) — approving half-blind.
❌ **No terminal states for non-draft items.** A needs-read reply handled by
phone call lingers forever; nothing can be marked handled or snoozed.
❌ No push channel (email) — the queue only works if visited. (Pass 2, needs
Resend.)
❌ No keyboard/bulk triage — irrelevant at 2/day, needed at 10+/day.

### Duty B — context: the biggest hole
✅ Chat with 9 live tools; per-lead engagement chips; live pulse everywhere.
❌ **There is no lead dossier.** The data exists — Instantly has the full email
thread and lead record; Postgres has classifications, drafts, approvals,
suppressions — but no page joins them. "Meeting in 10 minutes with Meridian"
currently means opening Instantly + scrolling the console + hoping.
❌ **No search.** At 1,500 leads/month, feeds don't scale; name → dossier must
be one keystroke.
❌ **Bruno can't do it either.** He has no `get_lead_history` tool, so "prep me
for the Meridian call" fails even conversationally — the cheapest possible fix
for the meeting scenario.
❌ **No history stream.** "What happened Tuesday?" is unanswerable; the digest
and watchdog jobs are well-built but post into the void (# updates channel,
already agreed, fixes this).

### Duty C — command: read-mostly
✅ Kill switch; retry/clear failed jobs; approve-and-send.
❌ **Campaign controls are read-only.** The console says "paused · limit
135/day" but resume/throttle live in Instantly. The golden-rule moment — "reply
rate holds 3%, scale to 350/day" — ends with the owner leaving the console.
❌ **Lead feeding absent** (plan item B7). At 5k/mo, topping up is a weekly
chore; today it's CSV-in-Instantly with the field-mapping bug class the plan
explicitly wanted killed.
❌ **No memory.** "Never discount on the first call" evaporates when the chat
scrolls away (C2 lessons unbuilt).
❌ No spend guard (B6).

### Trust: partial
✅ Handled-for-you explains autonomous suppressions; approvals log exists;
originals now preserved (B4).
❌ Edit-diffs (Bruno's draft vs what was actually sent) are stored but not
viewable — that's both the trust view and the Phase C learning input.

## 4. Proposal — organize around the lead, ship in three increments

**Principle: the unit of this console is the lead conversation, not the
metric.** Every page is a view over one spine: lead → touches → reply →
decision → outcome. Metrics are derivatives.

### The operating rhythm it should support
- **Morning, 5 min:** open # updates (Bruno's overnight digest + alerts) → run
  Inbox to zero, each card decided inside itself.
- **On a ping (pass 2):** email → deep link → approve from the phone, <1 min.
- **Before a call, 30 sec:** search the lead → dossier; or ask Bruno "prep me
  for X" from anywhere.
- **Weekly, 15 min:** Campaign verdicts + Bruno's retro in # updates → scale or
  hold, executed *in the console*.
- **Monthly:** System stays quiet; review what Bruno has learned.

### Increment 1 — Operate (build immediately)
1. **# updates channel** — digest/watchdog/analytics/errors post into a
   reply-able feed; sidebar CHANNELS with unread dot.
2. **Lead dossier + search** — `/dashboard/lead?email=…`: full Instantly thread
   (sent + received, step/variant tagged), engagement, Bruno's reads with
   reasons and suggested actions, drafts with original-vs-sent, suppression
   trail, current sequence state. Sidebar search; every lead name everywhere
   links here.
3. **Bruno's `get_lead_history` tool** — the dossier as a tool, prospect text
   untrusted-framed → "prep me for the Meridian call" works in chat.
4. **Inbox as a real work queue v1** — SLA coloring vs the 1-hour benchmark,
   Bruno's suggested action on the card, "replying to email 2 · variant B"
   context line, dossier link.

### Increment 2 — Command
5. Campaign pause/resume + daily-limit control in-console (confirm-gated).
6. Email notifications via Resend (hot reply → deep link; digest optional).
7. Mark-handled / snooze states for needs-read and stale items.

### Increment 3 — Scale & learn (as volume arrives)
8. Lead feeding: CSV upload → score → push to Instantly (kills mapping bugs).
9. Lessons (C2) + edit-diff review (C3), retro posting to # updates.
10. Keyboard triage + bulk ops past ~10 approvals/day; spend guard (B6).

### Deliberately not building
Multi-user roles (until a second approver exists), a CRM (Instantly stays the
source of truth), autonomous sending (approval stays human), an analytics
warehouse.
