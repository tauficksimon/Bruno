# AI SDR Agent — Rollout Plan

_Last updated: 2026-06-23_

This document explains, in plain language, where the project stands today, the key
decisions we've made, and the exact order of work to get it live for Kinta
(hirekinta.com). It's written to be read top to bottom by a non-engineer.

---

## 1. The one-paragraph summary

We've built the "brain and bookkeeping" layer that sits on top of Kinta's outbound
email. It does **not** send email — Instantly does that. When a prospect replies,
this system reads the reply, decides what kind of reply it is (interested? a question?
not interested?), drafts a suggested response, writes a clean record into the CRM
(Instantly CRM/Postgres), and pings the team in Slack. The core machine is already built and deployed.
What's left is (a) connecting it to the real accounts and (b) finishing a few pieces
that are currently placeholders. **There's no time pressure right now**, because the
business hasn't started sending email yet.

---

## 2. Where things actually stand today (verified)

We checked the live Instantly account directly. Here is the real state:

| Thing | Status |
| --- | --- |
| Instantly account | Active, belongs to Kinta (hirekinta.com) |
| Inboxes (email accounts) | 2: `alex@hirekinta.com`, `daniel@hirekinta.com` |
| Inbox warmup | In progress, started June 12 (scores 98 and 100 — nearly ready) |
| Campaigns running | **0** — none created yet |
| Emails sent | **0** |
| Replies received | **0** |
| Instantly API key | Works (tested, read-only). **Must be rotated — see Security.** |
| Instantly API version | v2 |
| Instantly webhooks | A **paid** feature, not available on the current plan |

**Plain meaning:** the company is at the starting line. The inboxes are finishing
"warmup" (the reputation-building period before real cold email can go out safely).
No campaigns exist, so nothing has been sent, so there are no replies for the system
to react to yet. The machine is built; the business just hasn't started feeding it.

---

## 3. What's already built (the good news)

The hard, easy-to-get-wrong foundation is done and deployed on Railway:

- **A reliable job queue** (in Postgres) — work is never lost, retries automatically
  if something fails, and won't process the same reply twice.
- **The reply-handling pipeline** — receive a reply → classify intent → draft a
  response (for hot replies) → update Instantly CRM/status where appropriate → alert Slack.
- **Claude integration** — classifies replies and writes drafts, with a simple
  keyword fallback so it still runs even before the Claude key is added.
- **Integration wrappers** for Instantly, Slack, and Apollo.
- **Webhook endpoint + signature checking**, scheduled jobs (daily digest, weekly
  analytics), health checks, and a Docker/Railway deploy.

---

## 4. What's NOT finished (the honest gaps)

These are placeholders or missing pieces. None are hard blockers, but they must be
done before "real" launch:

1. **No way to hear about replies without paid webhooks.** This is the biggest one —
   see the decision in Section 5.
2. **CRM source changed.** Kinta will use Instantly CRM, not HubSpot. The launch path is
   Instantly lead interest/status + block lists, with Postgres as the agent audit trail.
3. **The Instantly "stop sequence" and "suppress lead" calls are guesses.** They need
   to be pointed at the real v2 API endpoints.
4. **No failure alerts.** If a job fails for good, it currently fails silently. Before
   real leads flow, failures should shout in Slack.
5. **Lead scoring and analytics** exist as modules but aren't wired into live flow yet
   (later phases).
6. **Missing API keys:** Claude (Anthropic) and Slack are not connected yet.

---

## 5. Key decision: Polling instead of Webhooks

**The problem:** the system was designed around Instantly *pushing* replies to us
instantly (a "webhook"). That's a paid feature Kinta doesn't have.

**The fix:** flip it around. Instead of Instantly telling us, our app *asks* Instantly
"any new replies?" every few minutes. This is called **polling**.

**Why this is fine:**
- It's free — works with the API key we already have.
- The only downside is a few minutes of delay instead of instant. For sales replies,
  that's irrelevant — nobody needs a sub-second response.
- **Nothing else in the system changes.** Once a reply is found, the exact same
  classify → draft → log → alert pipeline runs. We're only changing *how the app
  hears about the reply in the first place.*

**Trade-off to manage:** we poll on a sensible timer (every few minutes, only recent
items) to stay within Instantly's API limits, and we use Instantly's own message IDs
so we never process the same reply twice.

If Kinta later upgrades to a plan with webhooks, we can switch back with minimal work —
the pipeline is identical either way.

---

## 6. Accounts & access — what we need from the client

The principle: **Kinta owns every account; we get admin access under our own email.**
The client never needs to understand API keys or webhooks — their only job is to
create accounts and click "invite a teammate."

**The client's entire job:** create each account (or use the existing one) and add us
as an admin/owner using our email. That's it. We handle every technical step from there.

### Accounts in priority order

| # | Account | New or existing? | Why it matters | Needed for launch? |
| --- | --- | --- | --- | --- |
| 1 | **Instantly** | Existing ✅ | Sends email + is the source of replies. The engine. | Yes |
| 2 | **Anthropic (Claude)** | **New** | The brain — classifies replies, writes drafts. Billed per use; client's card. | Yes |
| 3 | **Railway (hosting)** | New (we set up) | Where the app runs + the database lives. | Yes |
| 4 | **Slack** | Workspace likely exists | The team's control center for alerts/approvals. | Yes |
| 5 | **Apollo** | Likely existing | Lead source for the scoring phase. | Later |
| 6 | **Sentry** | New, optional | Error monitoring. Nice-to-have. | Optional |

**The realistically "new" accounts the client must create: Anthropic, Slack app,
and Railway.** Everything else they already own — they just invite us.

### Keys vs. webhooks — who does what

- **API keys** (every service): we generate these ourselves once we have admin access,
  and put them straight into Railway's secure settings. The client never handles a key.
- **Webhooks** (only Instantly + Slack): these point at our live app URL, so they can
  only be set up *after* the app is deployed, and **we** configure them. Not the
  client's job. (And with the polling decision above, the Instantly webhook isn't even
  needed for now.)

---

## 7. Security — must-do items

1. **Rotate the Instantly API key.** It was shared in plain text during setup, so it
   should be considered exposed. Generate a fresh one in Instantly and put it directly
   into Railway — never paste it into chat or email.
2. **All keys live in Railway's environment settings**, never in the code.
3. **Separate keys for testing vs. production** where possible (especially Anthropic).
4. **Set the Instantly webhook secret** (or rely on polling) so the endpoint can't be
   spoofed in production.
5. **Account ownership stays with Kinta**; our access is by invitation and can be
   revoked cleanly when the engagement ends.

---

## 8. The build sequence (what we do, in order)

### Step 1 — Prove the machine works (fake data) ⬅ start here
Fire a *pretend* reply through the app and watch it classify → draft → log. Zero risk,
nothing real touched. Confirms the core works and reveals exactly what's still stubbed.
_Risk: none. Needs: the deployed app URL, or a local database._

### Step 2 — Build the polling job
The piece that lets the app catch replies on its own (Section 5). Built against the
real Instantly v2 API. Done now while there's no time pressure.
_Risk: low. Needs: the (rotated) Instantly key._

### Step 3 — Finish the real integrations
Wire the Instantly CRM/status fields we need and point the Instantly "stop sequence" /
"suppress" calls at the real endpoints.
_Risk: medium — this is the fiddly CRM-hygiene work. Needs the Instantly API key and plan._

### Step 4 — Connect the remaining keys
Add Claude (Anthropic) and Slack so the app runs at full quality.
_Risk: low. Needs: those three accounts + admin access._

### Step 5 — Add failure alerts + hardening
Failed jobs shout in Slack; handle API rate limits and partial failures gracefully.
_Risk: low. Needs: Slack connected._

### Step 6 — Go live
When warmup finishes and the first campaign starts sending, turn polling on and watch
the first real replies flow through. Monitor closely for the first week.

---

## 9. What "launch" looks like

A reply comes into `alex@hirekinta.com` or `daniel@hirekinta.com`. Within a few
minutes:

1. The app notices the reply (polling).
2. Claude reads it and decides: interested / question / objection / not now / not
   interested / unsubscribe / unclear.
3. If it's a hot reply, Claude drafts a suggested response.
4. The system updates Instantly CRM/status where appropriate and stores the audit trail in Postgres.
5. It stops the cold sequence so the prospect doesn't keep getting cold emails.
6. The team gets a Slack message: "Hot reply from [Company] — interested. Here's a
   draft response." A human reviews, edits if needed, and sends.

The human still closes. The system keeps everything organized, documented, and fast.

---

## 10. Open questions to decide

1. **Account ownership** — confirm all accounts sit under Kinta, with us as admins.
2. **Approval level** — should the team approve *every* drafted reply, or only certain
   types? (Recommended at launch: approve everything, loosen later.)
3. **Instantly CRM statuses/labels** — confirm how Kinta wants interested, not-now, negative, and booked-call states represented.
4. **Slack channels** — confirm the channel names for hot replies, approvals, errors,
   digests.
5. **When does the first campaign launch?** — that sets the real deadline.

---

## 11. Immediate next action

**Run the fake-data test (Step 1).** It's the highest-value, lowest-risk move: you see
the app work end-to-end and we learn what's solid vs. stubbed before building further.

To run it, we need either:
- the **live Railway app URL** (Railway dashboard → service → Settings → Domains), or
- a **local database** set up on the dev machine.

Recommended: test against the live Railway app if it's healthy.
