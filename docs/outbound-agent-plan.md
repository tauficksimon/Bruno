# Outbound Agent — Implementation Plan

_Last updated: 2026-07-05_

## 1. The vision (one paragraph)

We are turning the AI SDR agent into a single **"agent in charge of outbound."** It keeps
doing its autonomous job — reading inbound replies, classifying intent, and drafting
responses — **and** it becomes a teammate the boss can talk to directly in Slack, with live
visibility into the Instantly account. Managing it should feel like managing a human SDR:
_"How's outreach going?"_, _"Who replied this week?"_, _"What's our reply rate?"_,
_"Draft a response to this one and show me."_ The boss asks **the agent**, not the engineer.

---

## 2. What already exists (we reuse it)

- **Job queue + worker** (Postgres-backed, retries, dedupe).
- **Reply pipeline** (`src/jobs/processInstantlyEvent.ts`): classify → draft → HubSpot note →
  stop sequence → Slack alert.
- **Two agents**: `classifyReply` (Haiku) and `draftReply` (Sonnet 5).
- **Instantly integration**: list campaigns/accounts, create/patch/pause campaign.
- **Slack posting** via `@slack/web-api`; env already has `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET`.
- **Claude integration** is currently **single-shot JSON** (no tools) — upgrading this is the
  core technical change.

---

## 3. Phase 1 — read-only conversational agent (this build)

The agent can **answer anything** about the account and **draft replies**, but does **not**
pause campaigns or send emails on its own. Safe to put in front of a boss.

### 3.1 Instantly "read" layer — the agent's eyes
Extend `src/integrations/instantly.ts` with typed read functions (every endpoint below was
verified live during setup):

| Function | Returns |
| --- | --- |
| `getCampaignAnalyticsOverview(id)` | sent, opens, replies, bounces, reply/open rate |
| `listCampaignLeads(id, {limit})` / `countLeads(id)` | lead roster + counts |
| `listRecentReplies({id, limit})` | who replied, when, subject, snippet |
| `getWarmupAnalytics(emails[])` | per-inbox warmup + inbox-landing health |
| `listCampaigns()` / `listAccounts()` | (already exist) |

### 3.2 Agent core — tool-using loop
- Add `runClaudeConversation({ system, messages, tools, model })` to
  `src/integrations/claude.ts`: implements the Messages API **tool-use loop** (call → on
  `tool_use`, run the tool, return `tool_result`, repeat until `end_turn`).
- New `src/agents/outboundAgent.ts`:
  - Declares the tool set (JSON schemas) mapped to the Instantly read functions + `draftReply`.
  - **System prompt**: identity ("You are Kinta's AI SDR running outbound…"), campaign context
    (name, goals, the _don't-scale-until-3%_ rule), tone (concise, numbers first), and the
    Phase-1 safety boundary (read + draft only).
  - `runOutboundAgent(conversation)` → the agent's reply text.
- Model: **Sonnet 5** for conversation; classification stays **Haiku**.

### 3.3 Conversation memory
- New Postgres table `agent_conversations (thread_key, role, content, created_at)` so
  multi-turn follow-ups work and survive restarts. Keyed by Slack thread (channel + `thread_ts`)
  or DM.

### 3.4 Slack interface — where the boss talks to it
- New `src/webhooks/slack.ts`: `POST /slack/events`.
  - Verify Slack signature (`SLACK_SIGNING_SECRET`); handle the `url_verification` challenge.
  - Handle `app_mention` (channels) and `message.im` (DMs).
  - Ack within 3s, then enqueue a job → worker runs `runOutboundAgent` → posts the reply
    **in-thread** via `WebClient`.
- **One-time Slack app setup (you do this — I'll give exact steps):** enable Events API with
  Request URL `PUBLIC_BASE_URL/slack/events`; add scopes `app_mentions:read`, `chat:write`,
  `im:history`, `im:read`; subscribe to `app_mention` + `message.im`; reinstall the app.

### 3.5 Keep the pipeline + a local test harness
- The classify/draft pipeline is unchanged; it keeps posting hot replies to Slack (the agent
  "reporting in").
- New `npm run agent:chat "…"` CLI to talk to the agent **locally, without Slack** — verifies
  the tool-loop + live Instantly reads before we wire Slack.

---

## 4. "Let it act" — now unified **Phase B** (see infrastructure-plan §7)

Side-effect tools behind a **confirmation step**: `pauseCampaign` / `resumeCampaign`,
`sendDraftedReply` (via Instantly's reply endpoint), `addLead`. The agent asks in Slack
("Pause the Kinta campaign — yes/no?") before executing.

## 5. "Proactive" — now split across unified **Phase A** (watchdog) and **Phase D** (strategy)

Agent-posted daily digest + threshold alerts ("Reply rate fell below 3% — recommend holding
off on scaling").

---

## 6. Build order

1. Instantly read layer + check each function against the live API.
2. Tool-loop in `claude.ts` + `outboundAgent.ts` (tools + system prompt).
3. Local CLI harness → confirm "how's the campaign?" returns real numbers.
4. Conversation table + memory.
5. `POST /slack/events` endpoint + worker wiring.
6. **You** configure the Slack app (documented) → test in a channel.
7. Ship on Railway; campaign stays paused until real leads are loaded.

---

## 7. Dependencies & risks

- **Slack app config is manual (you).** I'll provide exact click-by-click steps.
- **Public URL**: Slack Events needs the Railway deploy reachable; locally we use the CLI
  harness (or ngrok).
- **Instantly "trial ended"**: the **read** API works today (used it all through setup), so
  Phase 1 is not blocked. Only Phase 2 _send_ actions might be gated by the plan.
- **Model cost**: each boss question is a few Sonnet calls — negligible at this volume.

---

## 8. What I need from you to start

- Green light on **Phase 1 = read-only** (answer + draft, no autonomous actions).
- Confirmation that **Slack** is the boss's interface (assumed, since the project is already
  Slack-based).

---

## 9. Phase 1 — BUILT ✅ (2026-07-05)

Phase 1 is implemented and verified end-to-end against the live Instantly account.

**Files added / changed**

| File | What it does |
| --- | --- |
| `src/integrations/instantly.ts` | Read layer: `getCampaignAnalyticsOverview`, `listRecentReplies`, `listCampaignLeads`, `countCampaignLeads`, `getWarmupAnalytics`, `getInstantlyCampaign`. |
| `src/integrations/claude.ts` | `runClaudeConversation` (tool-use loop). Also **fixed a pre-existing pipeline bug**: `callClaudeJson` now injects the required JSON shape from the zod schema + strips fences + repairs on failure, so classification/drafting are reliable. |
| `src/agents/outboundAgent.ts` | The agent: 8 tools (campaigns, performance, replies, leads, inboxes, warmup, draft_reply), system prompt, read-only boundary, `runOutboundAgent`. |
| `src/db/conversations.ts` + `migrations/002_agent_conversations.sql` | Per-thread conversation memory. |
| `src/tools/chatWithOutboundAgent.ts` (`npm run agent:chat`) | Local CLI to talk to the agent without Slack. |
| `src/webhooks/slack.ts` | `POST /webhooks/slack/events`: signature verification, url_verification, `app_mention` + `message.im`, dedupe, fast ack, enqueue. |
| `src/jobs/processOutboundAgentReply.ts` + worker/queue wiring | Runs the agent for a Slack message and posts the answer in-thread. |
| `src/server.ts` | Raw-body parser so Slack signatures verify against exact bytes. |

**Verified:** live campaign/performance/inbox/warmup answers; `draft_reply`; correct refusal of action requests; Slack `url_verification`; end-to-end `app_mention` → agent → threaded reply; multi-turn thread memory (a follow-up "is that enough?" correctly used the prior turn).

**Try it locally now (no Slack needed):**
```
npm run agent:chat "how is the Kinta campaign doing?"
npm run agent:chat            # interactive
```

---

## 10. Slack app setup (one-time, ~10 min — your step)

The agent code is done; Slack just needs an app pointed at the deployed server.

1. **Create the app** — https://api.slack.com/apps → *Create New App* → *From scratch*.
   Name it "Kinta Outbound Agent"; pick your workspace.
2. **Bot scopes** — *OAuth & Permissions* → *Bot Token Scopes*, add:
   `app_mentions:read`, `chat:write`, `im:history`, `im:read`.
3. **Install** — *Install to Workspace* → copy the **Bot User OAuth Token** (`xoxb-…`) into the
   server env as `SLACK_BOT_TOKEN`.
4. **Signing secret** — *Basic Information* → copy **Signing Secret** into `SLACK_SIGNING_SECRET`.
5. **Event Subscriptions** — toggle *On* → Request URL:
   `https://<your-railway-domain>/webhooks/slack/events`
   (must be the deployed public URL; the server answers Slack's verification automatically).
   Under *Subscribe to bot events* add `app_mention` and `message.im`. Save.
6. **App Home** — enable the *Messages Tab* and "Allow users to send messages" so DMs work.
7. **Reinstall** if Slack prompts (scopes changed).
8. **Use it** — invite the bot to a channel (`/invite @Kinta Outbound Agent`) and @-mention it,
   or DM it: _"how's the campaign doing?"_

**Env vars** (all already in the schema): `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`,
`PUBLIC_BASE_URL`. The Request URL must be publicly reachable, so this needs the Railway deploy
(or an ngrok tunnel) — local-only testing uses `npm run agent:chat`.

---

## 11. Phase 2 / Phase 3 — SUPERSEDED by the unified roadmap

This doc's phase numbering is retired. The single source of truth for sequencing is
**`infrastructure-plan.md` §7 (unified roadmap)**, reconciled 2026-07-06 with
`agent-design.md` and `audit-2026-07-06.md`:

- This doc's **Phase 1** → built & verified (see §9).
- This doc's **Phase 2** (action tools behind confirmation) → unified **Phase B** (items B1–B3).
- This doc's **Phase 3** (proactive digests/alerts) → split: watchdog/standup → unified
  **Phase A** (A10–A11); proactive strategy recommendations → unified **Phase D** (D4).
