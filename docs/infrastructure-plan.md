# Kinta Outbound — Master Infrastructure Plan

_Date: 2026-07-06 · This is the governing execution document. It sequences the work defined
across the project's design docs:_
- _`agent-structure.md` — the **foundational vision** (from the initial scaffold): architecture,
  agent modules, feedback loops, 10k/mo sizing, original 6-phase plan. Still the reference for
  the "why"; its Phase 1–6 are re-sequenced here (see §7)._
- _`agent-design.md` — the **agent as an entity**: anatomy, memory, autonomy trust ladder, learning._
- _`outbound-agent-plan.md` — the boss-facing chat agent (its Phase 1 is built)._
- _`rollout-plan.md` — the earlier launch-ops plan (polling decision, honest-gaps list)._
- _`audit-2026-07-06.md` — findings H1–L5, all folded into §7._

---

## 1. Start from the business, not the tech

Kinta sells nearshore placements to US companies. Outbound is the acquisition engine. The
funnel the infrastructure must serve:

```
Apollo (leads) → Instantly (send) → Prospect replies → Fast, good response
      → Booked call → Placement ($$)
```

What actually moves revenue, in order of leverage:

1. **Speed-to-lead.** Your own campaign doc's benchmark: replies answered <1 hour convert
   10–20% to booked calls. Every hour of delay costs real money. This is the #1 thing the
   infrastructure must guarantee.
2. **Deliverability.** If mail lands in spam, everything upstream is wasted. Warmup, gradual
   scaling, suppression hygiene, plain-text sending.
3. **Volume with quality.** 400/wk now → 2,000/wk once Email-1 reply rate holds >3%
   (the golden rule — encode it, don't just remember it).
4. **Learning loop.** Know which copy/segment works so the next 2,000 leads outperform the
   last 2,000.
5. **Zero silent failures.** A dead job queue that nobody notices = weeks of lost pipeline.

Everything below is justified by one of these five.

## 2. Architecture principles

- **One boring monolith.** Node/TS + Fastify + Postgres on Railway, worker in-process. At
  ~2,000 leads/month and <200 replies/month this is *overwhelmingly* sufficient. Splitting
  services would add failure modes, not capacity.
- **Buy the commodity, build the brain.** Instantly does sending/warmup/rotation; Apollo does
  lead data; HubSpot does CRM; Slack is the UI. We build only the intelligence layer
  (classify, draft, score, converse) and the glue.
- **Human-in-the-loop exactly once per money moment.** The agent drafts; a human taps
  *Approve* before anything is sent to a prospect. Everything else (classifying, logging,
  alerting, reporting) is autonomous. As trust builds, loosen selectively.
- **The agent is the interface.** The boss never opens Instantly or a dashboard. Slack chat +
  proactive alerts *are* the product surface. (Phase 1 of this is built.)
- **Pull > push where the vendor makes push expensive.** Instantly webhooks are a paid
  add-on; polling every 3–5 min is free and well within the speed-to-lead budget.
- **Fail loud.** Any terminal failure lands in `#agent-errors`. Silence must mean health.

## 3. Target architecture

```
                        ┌────────────────────────────────────────────┐
                        │            Railway (one service)           │
  Apollo API ──────────▶│  Fastify server ── cron ── worker loop     │
                        │      │            │           │            │
  Instantly API ◀──────▶│  webhooks     schedules    jobs (queue)    │
   (send, leads,        │  /slack/events  reply.poll  classify/draft │
    replies, analytics) │                 metrics.rollup  agent.reply│
                        │                 digest/weekly  hubspot.sync│
  HubSpot API ◀─────────│                                            │
                        │              Postgres                      │
  Slack  ◀─────────────▶│  events · jobs · reply_classifications ·   │
   (boss chat,          │  drafts · approvals · lead_scores ·        │
    approve buttons,    │  suppression_events · metrics_daily ·      │
    alerts, digest)     │  agent_conversations                       │
                        └────────────────────────────────────────────┘
                                    Claude API
                （Haiku: classify/score · Sonnet 5: draft/converse/analyze）
```

**Key insight from the audit:** the original schema already anticipated this entire design —
`drafts.status (drafted→approved→sent)`, `approvals`, `metrics_daily`, `lead_scores` are all
sitting dormant. The plan is to **light up existing tables**, not redesign.

## 4. The funnel, stage by stage

### 4.1 Lead acquisition (Apollo → score → Instantly)
**Today:** manual CSV export/import; `searchLeads` and `scoreLead` exist but are unwired.
**Target:** a `leads:import` flow — pull an Apollo search, run `scoreLead` (Haiku, already
built), write `lead_scores`, and push tier 1–3 leads into the Instantly campaign via
`POST /api/v2/leads` (proven working in testing). Field mapping is code, so
`{{firstName}}/{{companyName}}` can never silently break again — the exact bug we hit in
testing, eliminated structurally.
**Manual fallback:** CSV import stays supported; the doc's mapping checklist applies.

### 4.2 Sending (Instantly)
**Today:** campaign live & paused, correct sequence/schedule, 2 warm inboxes, ~60/day cap.
**Target:**
- Encode the **3% golden rule**: the metrics job flags when Email-1 reply rate >3% over a
  meaningful sample (≥300 sends) and tells Slack "safe to scale"; scaling itself stays a
  human action (buy inboxes, raise `daily_limit`).
- Inbox expansion path: 2 → 10 inboxes (hirekinta.com + workwithkinta.com already exist —
  the second domain protects the primary's reputation).
- Suppressions flow to Instantly block-lists (real endpoint, per audit M1) so unsubscribes
  are honored account-wide. Compliance: unsubscribe header already on; keep text-only.
**Hard dependency:** the Instantly *plan* (trial-ended banner). Sending at volume, more
inboxes, and possibly the leads API at scale all hang on this. Resolve before launch.

### 4.3 Reply engine (the money loop)
**Today:** classify→draft pipeline exists but has **no feed** (audit H1) and no send path.
**Target — the centerpiece:**
```
reply.poll (cron 3–5 min, uses listRecentReplies)
  → dedupe (events table) → classify (Haiku) → draft (Sonnet)
  → Slack #agent-hot-replies: reply summary + draft + [Approve & Send] [Edit] [Reject]
  → Approve → POST /api/v2/emails/reply (Instantly) → drafts.status='sent' + approvals row
  → stop sequence for that lead (real endpoint) → HubSpot note
```
- Speed-to-lead: poll every 3 min + instant Slack push ⇒ human can approve inside minutes
  from a phone. This beats the <1hr benchmark without autonomous sending risk.
- Slack **interactive buttons** (one new endpoint, `/slack/interactive`) drive the approval.
  This is also exactly the agent's Phase B confirmation machinery — same buttons.
- Negative/unsubscribe intents: auto-suppress (no approval needed — it's removal, not
  outreach).
- Prompt-injection hardening (audit M5): prospect text is always framed as untrusted data.

### 4.4 CRM (HubSpot)
**Today:** stub note, attached to nothing.
**Target (deliberately thin):** on classified reply — upsert contact by email → attach note
(classification + draft + thread) → for `positive` intent, create/update a deal in a
"Meeting requested" stage. `hubspot_mappings` table already exists for the ID links. That's
it — no two-way sync, no property mirroring. HubSpot is the system of record for *people and
deals*; Postgres remains the system of record for *events and metrics*.

### 4.5 Metrics & the learning loop
**Today:** `metrics_daily` empty; weekly analytics posts placeholder junk through Sonnet (audit L3).
**Target:**
- Nightly `metrics.rollup` job: `getCampaignAnalyticsOverview` (already built) per campaign
  → upsert `metrics_daily`. Cheap, idempotent, no LLM involved.
- Daily digest (already scheduled) becomes real: sends, replies, intent mix, warmup health,
  approvals pending. One glance = full state.
- Weekly analytics agent now gets **real data** (metrics_daily + reply_classifications
  intent distribution) → recommendations with confidence to `#agent-analytics`.
- Copy iteration: Instantly supports multiple variants per step. When volume justifies it
  (≥1,000 sends), the agent proposes subject/body variants; human approves; results are
  compared in the weekly report. This is the flywheel: each cohort outperforms the last.

### 4.6 The conversational agent (boss surface)
**Read-only chat built and verified (agent level L1).** Next, per the unified roadmap §7:
- **Act with confirmation (Phase B):** pause/resume campaign, approve/send drafts, add
  leads — every action echoes back as a Slack confirmation before executing. Reuses the
  same interactive-buttons endpoint as 4.3.
- **Proactive (Phase A watchdog + Phase D strategy):** the agent *initiates* — "3 drafts
  waiting >2h" and "bounce rate spiked on daniel@" are watchdog alerts (Phase A); "reply
  rate crossed 3% — recommend scaling" is a strategy recommendation (Phase D). Both are the
  same read tools on cron with thresholds; no new intelligence needed.

## 5. Reliability, security, cost

### 5.1 Hardening (from the audit — non-negotiable before launch)
| Item | Source |
|---|---|
| Fail-closed webhook auth in prod; delete `x-bruno` bypass; raw-body HMAC | H2, L1 |
| Reclaim stale `running` jobs; terminal failures → `#agent-errors` | M2 |
| Idempotent agent job; error reply to thread; trim leading assistant turns | M3, M4 |
| Real Instantly endpoints for stop-sequence / suppression, verified live | M1 |
| Untrusted-text framing for prospect content | M5 |
| Rotate Anthropic + Instantly keys; Railway env parity check on deploy | M6 |

### 5.2 Operations
- **Health:** Railway healthcheck on `/health`; extend it to report queue depth and oldest
  queued job age (a wedged worker then fails the healthcheck instead of rotting silently).
- **Backups:** enable Railway Postgres daily backups (one click; the DB is the business
  memory).
- **Tests (thin, targeted):** vitest on the money paths only — signature verification,
  queue claim/retry idempotency, zod schemas, event normalization, `describeZodSchema`.
  No UI/e2e theater.
- **Logs:** pino stays; Slack is the alerting channel. No Datadog/Sentry until scale demands.

### 5.3 Cost model (why we optimize for reliability, not spend)
| Item | Est. monthly |
|---|---|
| Claude — ~200 replies classified+drafted, ~300 boss questions, weekly analytics | **< $15** |
| Railway (service + Postgres) | ~$15–25 |
| Instantly paid plan | ~$37–97 |
| Apollo | ~$49–99 |
| **Total infra** | **≈ $120–240/mo** |

One placement pays for years of this. Conclusion: never trade reliability or speed-to-lead
for infra savings; the only cost worth managing is *wasted sends to bad leads* (that's what
scoring is for).

## 6. What we deliberately do NOT build

- **No microservices / queues-as-a-service / Kafka.** The Postgres queue is correct at
  1000× current volume.
- **No vector DB / RAG.** The agent's context is live API data, not documents.
- **No agent framework (LangChain etc.).** The 100-line tool loop is debuggable and owned.
- **No custom dashboard/web UI.** Slack + the daily digest are the dashboard. Revisit only
  if a third stakeholder who can't live in Slack appears.
- **No fine-tuning.** Prompt + few-shot in the drafting agent covers tone; revisit at
  1,000+ replies of training signal.
- **No autonomous sending.** Approval stays human until reply volume makes it a bottleneck
  (a good problem; revisit at >20 approvals/day).
- **No multi-channel (LinkedIn, calling) automation.** Email must prove the model first.

## 7. Roadmap — UNIFIED (supersedes all earlier phase lists)

_Reconciled 2026-07-06: this single breakdown folds in every `audit-2026-07-06.md` finding
(H1–L5) and every `agent-design.md` (§AD) work item. **If a work item isn't in this table, it
isn't planned.**_

**How every earlier phase scheme maps here** (so no plan is orphaned):

| Earlier scheme | Where it lives now |
|---|---|
| `agent-structure.md` Phase 1 — Production Skeleton | ✅ **Done** (the scaffold: server, queue, worker, clients, Docker) |
| `agent-structure.md` Phase 2 — Reply Operations | **Phase A** (feed + classify/draft/route) + **B** (send) |
| `agent-structure.md` Phase 3 — Lead Scoring | **Phase B** (B7: Apollo import-and-score) |
| `agent-structure.md` Phase 4 — Slack Control Center | ✅ chat built (L1) + **Phase B** (approvals channel/buttons) |
| `agent-structure.md` Phase 5 — Analytics & Feedback Loops | **Phase A** (metrics.rollup) + **C** (learning loops) |
| `agent-structure.md` Phase 6 — Scale to 10k+ | **Phase D** |
| `outbound-agent-plan.md` Phase 1 / 2 / 3 | ✅ built / **Phase B** / **Phases A+D** |
| `agent-design.md` §8 A/B/C/D | 1:1 with the phases below |

_Note: `agent-structure.md`'s "Deliverability Monitor" module is realized as the **watchdog
loop** (bounce/warmup thresholds — A11) plus the **deliverability feedback loop** in the
weekly retro (C3). Its "Open Decisions" list is reconciled with the decision points below._

### Phase A — Make it real · ~1–1.5 dev-days
The pipeline gets its feed, every audit hole is closed, and the agent gets its Phase-A mind.

| # | Work item | Source |
|---|---|---|
| A1 | `reply.poll` cron job (3–5 min) → dedupe → enqueue pipeline events | AUDIT-H1 |
| A2 | Fail-closed webhook auth in prod; delete `x-bruno` + static-Bearer bypasses; verify Instantly HMAC against `request.rawBody` | AUDIT-H2, L1 |
| A3 | Real Instantly endpoints for stop-sequence (`update-interest-status`) + suppression (`block-lists-entries`), verified live | AUDIT-M1 |
| A4 | Queue: reclaim stale `running` jobs; terminal failures → `#agent-errors` | AUDIT-M2 |
| A5 | Agent Slack job: idempotent retries; error reply posted to thread on final failure | AUDIT-M3 |
| A6 | Trim leading `assistant` turns when loading conversation windows | AUDIT-M4 |
| A7 | Untrusted-text protocol: frame all prospect-authored content in tool results + prompts | AUDIT-M5 / AD§6 |
| A8 | Layered prompt assembly: identity core + live-injected context (campaign facts pulled fresh, replaces hardcoded) + safety layer + task modules | AD§2.5, AUDIT-L5 |
| A9 | Reply money-loop v1: poll → classify → draft → post to `#agent-hot-replies` (approval buttons land in B; until then the draft is copy-paste) | AD§4.1 |
| A10 | `metrics.rollup` nightly job → `metrics_daily`; daily digest becomes the agent's real standup; weekly analytics gated until it has real data (stop placeholder Sonnet calls) | AUDIT-L3 / AD§4.3 |
| A11 | Watchdog v1: bounce/warmup/queue-age/stale-draft thresholds, alert-once semantics | AD§4.4 |
| A12 | Kill switch: `config_values.agent_paused` checked by all loops, settable from chat | AD§3 |
| A13 | `describeZodSchema`: handle unions-of-literals + array element shapes | AUDIT-L2 |
| A14 | `normalizeInstantlyEvent`: content-hash fallback id (dedupe works without vendor ids) | AUDIT-L4 |
| A15 | Cosmetics: "Honduras" → "Central America" consistency in agent prompts | AUDIT-L5 |

*Done when:* a test reply auto-classifies, drafts, and alerts Slack within 5 minutes with
zero manual steps; `kill -9` mid-job loses nothing; unset secrets in prod reject webhooks;
the standup posts real numbers.

### Phase B — Launch support · ~2 dev-days + your ops
Prospect-facing sends become one tap; real leads flow in; the agent gets hands (with a leash).

| # | Work item | Source |
|---|---|---|
| B1 | `/slack/interactive` endpoint + Approve/Edit/Reject buttons on drafts | plan §4.3 |
| B2 | T2/T3 confirmation machinery — same flow drives chat confirmations ("pause it? [yes/no]") and buttons; action tools: `send_reply`, `pause_campaign`, `resume_campaign`, `add_leads` | AD§3, §2.3 (old agent-plan Phase 2) |
| B3 | Approved send via Instantly `emails/reply` → `drafts.status='sent'` + `approvals` row + stop sequence + CRM note | plan §4.3 |
| B4 | Migration: `approvals.final_body` (captures human edits — the learning signal for C) | AD§5.1 |
| B5 | Working-memory queries: "what's pending?", stale-approval nag wired to watchdog | AD§2.4 |
| B6 | Spending guard: daily Claude budget in `config_values`, 80% alert, heuristic-fallback degradation | AD§3 |
| B7 | Apollo import-and-score flow (`searchLeads` → `scoreLead` → Instantly `POST /leads`); CSV fallback documented | plan §4.1 |
| **B-ops (you)** | Resolve Instantly plan/trial · rotate Anthropic + Instantly keys (AUDIT-M6) · Slack app setup (agent-plan §10) · remove 3 test leads · load first real cohort · answer the 3 decision points below | — |

*Done when:* first real cohort live; a reply approved from a phone in <1 min end-to-end;
an edited draft stores both versions.

### Phase C — Close the loop · ~1–2 dev-days
The CRM is real and the agent starts learning.

| # | Work item | Source |
|---|---|---|
| C1 | HubSpot real wiring: upsert contact → note → deal on `positive` (uses `hubspot_mappings`) | plan §4.4 |
| C2 | Migration: `agent_lessons` + learned prompt layer + chat teaching ("remember…"/"forget…") | AD§2.4, §5.4 |
| C3 | Weekly retro on real data: trends vs 3% rule, edit-diff review → proposed lessons, classification spot-check, autonomy report with graduation proposals | AD§4.3, §5.1 |
| C4 | Objection library: SQL retrieval of past objection→approved-response pairs into drafting exemplars | AD§5.2 |
| C5 | `not_now` nurture: 60–90d resurface notes + CRM logging | AD§4.1 |

*Done when:* boss runs the operation entirely from Slack; every reply exists in HubSpot;
the retro cites at least one learned lesson from real edit-diffs.

### Phase D — Scale (gated on the 3% rule firing) · ongoing
| # | Work item | Source |
|---|---|---|
| D1 | Inbox expansion 2→10, volume ramp per golden rule; agent flags "safe to scale" with evidence | plan §4.2 |
| D2 | Copy A/B variants: agent proposes from measured winners, human approves, retro compares | plan §4.5 / AD§5.3 |
| D3 | Graduated autonomy: T3→T1 auto-send for high-confidence positive slice, per §AD3 evidence thresholds | AD§3, §7 |
| D4 | Proactive strategy alerts (scale/pause recommendations) — old agent-plan Phase 3 | AD§4.4 (old agent-plan Phase 3) |
| D5 | Campaign onboarding from a brief; conversation-table pruning; approval-fatigue review | AD§8, AUDIT-L5 |

**Decision points for you (flagged, not blocking):**
1. Who approves drafts — you, the boss, or either? (Affects Slack channel/permissions.)
2. Calendly (or similar) link for the "book a call" CTA in approved replies?
3. Apollo plan level — API access for automated import, or stay CSV for cohort 1?
4. (From AD§6) Will prospect-facing emails disclose AI assistance? Must be answered before
   any T3→T1 graduation in Phase D.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Instantly plan lapse blocks sending at volume | Resolve billing before Phase B; agent monitors send failures |
| Deliverability collapse from scaling too fast | 3% rule encoded; warmup monitored daily; second domain isolates risk |
| Approval bottleneck (nobody taps Approve) | Digest nags on stale drafts; Phase D proactive alert; revisit autonomy threshold |
| Prompt injection via prospect replies | Untrusted framing (5.1); approval gate means no autonomous action on injected text |
| Single-developer bus factor | Everything in this repo + docs/; boring stack; no exotic services |
