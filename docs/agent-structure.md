# AI SDR Operating System - Detailed Build Plan

## Goal

Build an always-on outbound operations layer for a Honduras-based staffing company selling into the US.

The system should not replace Apollo, Instantly, HubSpot, or the humans. It should sit on top of them and keep the machine organized, scored, documented, and improving.

```
Apollo finds leads.
Instantly sends sequences.
The agent scores, drafts, logs, monitors, and notifies.
HubSpot stays the source of truth.
Slack is the human control center.
Humans close.
Feedback loops improve the system.
```

## Core Architecture

```
                        ┌──────────────────────┐
                        │        APOLLO         │
                        │ lead source + filters │
                        └──────────┬───────────┘
                                   │ leads
                                   ▼
                        ┌──────────────────────┐
                        │      INSTANTLY       │
                        │ sequencing + sending │
                        └──────────┬───────────┘
                                   │ replies / bounces / opens
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         AGENT BACKEND                                    │
│                                                                          │
│  Managed Node/TypeScript service hosted on Railway, Fly.io, or Cloud Run │
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐  │
│  │ Webhooks     │────►│ Job queue    │────►│ Workers / agent modules │  │
│  │ Cron jobs    │     │ Postgres     │     │ Claude calls + API ops  │  │
│  └──────────────┘     └──────────────┘     └───────────┬─────────────┘  │
│                                                        │                 │
│  ┌─────────────────────────────────────────────────────▼─────────────┐  │
│  │ Postgres: events, jobs, scores, retries, metrics, cache, config    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└───────────────┬────────────────────┬────────────────────┬───────────────┘
                │                    │                    │
                ▼                    ▼                    ▼
        ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
        │   HUBSPOT    │     │    SLACK     │     │   CLAUDE     │
        │ CRM + deals  │     │ human ops UI │     │ judgment     │
        └──────────────┘     └──────────────┘     └──────────────┘
```

## Responsibilities

| Layer | Owns | Does not own |
|---|---|---|
| Apollo | Lead search, company/contact data, hiring signals | Scoring, CRM hygiene, sending |
| Instantly | Sending, sequencing, follow-ups, reply capture, bounce capture | Business pipeline, final qualification |
| Agent backend | Workflow, scoring, drafting, logging, notifications, retry logic, metrics | Email sending infrastructure |
| Claude | Judgment tasks: classify, score, summarize, draft, analyze | Long-term memory, direct control of vendor accounts |
| Postgres | Agent memory, jobs, dedupe, retries, metrics, cached state | Official sales pipeline |
| HubSpot | Business source of truth: companies, contacts, deals, notes, stages | Internal retry logs, raw event noise |
| Slack | Human control center: alerts, approvals, questions, errors | Source of truth |
| Humans | Closing, approvals, strategic decisions, fulfillment | Repetitive CRM/documentation work |

## Event Flow

The agent should be event-driven where possible. It should not poll every app constantly.

```
Instantly reply / bounce / open
        │
        ▼
Webhook endpoint receives event
        │
        ▼
Store raw event in Postgres
        │
        ▼
Dedupe by provider event ID
        │
        ▼
Create job in queue
        │
        ▼
Worker processes job
        │
        ├── fetch relevant context from HubSpot / Instantly
        ├── call Claude only if judgment is needed
        ├── update HubSpot
        ├── update Postgres state
        └── notify Slack
```

This avoids the risky pattern:

```
webhook -> do everything inline -> fail halfway -> lose the event
```

The webhook should acknowledge quickly, then let the queue/worker do the real work.

## Trigger Model

### Webhooks

Used when an external app knows something changed.

| Source | Event | Agent action |
|---|---|---|
| Instantly | Prospect replied | Classify intent, stop/adjust sequence if needed, log to HubSpot, notify Slack |
| Instantly | Bounce | Mark invalid, suppress contact, log deliverability metric |
| Instantly | Unsubscribe | Suppress contact, mark in HubSpot |
| HubSpot | Deal moved | Update internal state, schedule follow-up/nudge if needed |
| Slack | User asks a question | Fetch live context, answer in Slack |

### Cron Jobs

Used when work must happen on a schedule.

| Schedule | Job |
|---|---|
| Daily morning | Send Slack digest |
| Daily | Pull or sync lead batches from Apollo, if not fully manual |
| Daily | Check stale deals and create nudges |
| Weekly | Run campaign performance analysis |
| Weekly | Recommend targeting/copy/deliverability changes |
| Periodic | Refresh expiring API watches/tokens if needed |

## Agent Modules

All modules live inside the same backend. These are not separate servers.

```
agent-backend/
  scoring-agent
  reply-intent-agent
  drafting-agent
  crm-ops-agent
  slack-assistant
  analytics-agent
  deliverability-monitor
```

### 1. Lead Scoring Agent

Purpose: decide whether a lead is worth entering or prioritizing in a campaign.

Inputs:

- Apollo company/contact data
- job posting signal
- role type
- company size
- industry
- geography
- existing HubSpot history

Outputs:

- score
- tier
- reason
- recommended campaign
- HubSpot note

Claude should only see the fields needed to score that lead. It should not receive the entire CRM.

### 2. Reply Intent Agent

Purpose: classify inbound replies.

Intent categories:

```text
positive
question
objection
not_now
negative
unsubscribe
unclear
```

Actions:

| Intent | Action |
|---|---|
| positive | Create/update deal, stop cold sequence, draft response, notify Slack |
| question | Draft answer, keep deal/contact active, notify Slack |
| objection | Draft objection response, notify Slack for approval |
| not_now | Log timing, schedule re-touch, keep in HubSpot |
| negative | Mark unqualified, suppress if needed |
| unsubscribe | Suppress immediately, log compliance event |
| unclear | Ask human to classify |

### 3. Drafting Agent

Purpose: prepare human-ready responses.

Draft types:

- positive reply response
- objection response
- follow-up nudge
- meeting confirmation
- call prep summary
- candidate handoff message

Rules:

- Drafts should be concise.
- Drafts should preserve the company's positioning.
- Drafts should never send automatically unless explicitly allowed later.
- Drafts should include the reasoning in an internal note, not in the outbound message.

### 4. CRM Ops Agent

Purpose: keep HubSpot clean.

Responsibilities:

- create/update contacts
- create/update companies
- create/update deals
- add notes
- assign stages
- set next action dates
- document reply intent
- attach campaign/source metadata
- avoid duplicate records

HubSpot should stay clean and useful. Raw debug logs should stay in Postgres, not HubSpot.

### 5. Slack Assistant

Purpose: let the team operate the system from Slack.

Channels:

```text
#agent-hot-replies
#agent-approvals
#agent-daily-digest
#agent-errors
#agent-analytics
```

Example questions:

```text
What hot replies came in today?
What is the status on Acme?
Which campaign is performing best this week?
Which deals are stuck?
How many positive replies came from logistics companies?
Which inboxes are underperforming?
```

How it works:

```
Slack question
    ↓
Agent receives message
    ↓
Claude decides which tools/context are needed
    ↓
Backend fetches from HubSpot/Postgres/Instantly
    ↓
Claude summarizes
    ↓
Answer posted back to Slack
```

The Slack assistant should fetch live data. It should not rely on Claude memory.

### 6. Analytics Agent

Purpose: find what is working and what is not.

Tracks:

- reply rate
- positive reply rate
- meeting rate
- placement rate
- bounce rate
- unsubscribe rate
- industry performance
- role performance
- subject line performance
- campaign performance
- inbox/domain performance

Output:

- weekly summary
- recommended changes
- expected impact
- confidence level

### 7. Deliverability Monitor

Purpose: protect sending reputation.

Tracks:

- bounce rate
- unsubscribe rate
- reply rate
- spam complaint signals where available
- inbox performance
- domain performance
- ramp schedule
- sending volume per inbox

Actions:

- flag bad inboxes
- recommend pausing weak domains
- warn if bounce rate rises
- enforce suppression
- recommend volume changes

Deliverability is the highest-risk part of the whole system at 10k+ emails/month.

## Postgres Design

Postgres is the agent's operational memory. It is not a replacement for HubSpot.

Recommended tables:

```text
clients
campaigns
lead_scores
events
jobs
job_attempts
reply_classifications
drafts
approvals
hubspot_mappings
suppression_events
metrics_daily
metrics_weekly
agent_logs
cached_records
config_values
```

### Core Table Purposes

| Table | Purpose |
|---|---|
| events | Raw webhook events and provider IDs for dedupe |
| jobs | Queue of work to process |
| job_attempts | Retry/debug history |
| lead_scores | Claude scoring output for leads |
| reply_classifications | Intent classification and confidence |
| drafts | Drafted replies awaiting approval or review |
| approvals | Human approve/edit/reject history |
| hubspot_mappings | Link local IDs to HubSpot contact/company/deal IDs |
| suppression_events | Compliance and unsubscribe tracking |
| metrics_daily | Daily campaign, inbox, and pipeline metrics |
| metrics_weekly | Weekly summaries used by analytics loop |
| cached_records | Temporary cache to avoid hammering vendor APIs |

## HubSpot Design

HubSpot is the human-visible source of truth.

Recommended objects:

```text
Company
Contact
Deal
Activity / Note
Task
```

Recommended deal stages:

```text
New positive reply
Needs response
Discovery scheduled
Discovery completed
Candidate shortlist
Interviews
Placement pending
Closed won
Closed lost
Not now / recycle
Unqualified
```

Recommended custom properties:

```text
lead_source = Apollo
campaign_name
reply_intent
reply_intent_confidence
agent_score
last_agent_summary
next_action
recycle_date
instantly_campaign_id
instantly_lead_id
```

## Claude Usage

Claude should be used for judgment, not mechanical workflow.

Good Claude tasks:

- classify reply intent
- score lead quality
- summarize thread history
- draft responses
- analyze weekly performance
- answer natural-language Slack questions

Bad Claude tasks:

- checking if an event was already processed
- deciding whether a webhook is valid
- blindly looping over thousands of records
- storing memory
- sending emails directly without workflow controls

Recommended model routing:

| Task | Model class |
|---|---|
| Bulk lead scoring | Fast/cheap model |
| Reply classification | Fast/cheap or balanced model |
| Drafting important responses | Stronger model |
| Weekly analytics | Stronger model |
| Slack Q&A | Balanced model |

Optimization rules:

- Keep prompts scoped.
- Fetch only the relevant record/thread.
- Cache the static system prompt/rubric.
- Store scores/results in Postgres so they do not need to be recomputed.
- Use deterministic code before calling Claude.

## Feedback Loops

These are not reinforcement learning in the strict ML sense. They are supervised business feedback loops.

### 1. Lead Quality Loop

```
Apollo filters
    ↓
Leads scored
    ↓
Campaign performance measured
    ↓
Best industries / roles / company sizes identified
    ↓
Agent recommends filter changes
    ↓
Human approves
```

### 2. Copy Performance Loop

```
Subject line + copy version
    ↓
Reply / positive / meeting rate
    ↓
Agent compares versions
    ↓
Agent recommends better copy
    ↓
Human approves
```

### 3. Intent Accuracy Loop

```
Claude classifies reply as high intent
    ↓
HubSpot outcome later shows booked / lost / ignored
    ↓
Agent compares prediction vs outcome
    ↓
Scoring rubric is adjusted
```

### 4. Revenue Loop

```
Campaign generates meetings
    ↓
Meetings become deals
    ↓
Deals become placements
    ↓
Agent identifies which campaigns create revenue, not just replies
    ↓
Volume shifts toward revenue-producing segments
```

### 5. Deliverability Loop

```
Inbox/domain sends volume
    ↓
Bounce/unsubscribe/reply metrics tracked
    ↓
Weak inboxes/domains flagged
    ↓
Volume reduced or paused
    ↓
Reputation protected
```

Important rule:

```
Agent recommends.
Human approves.
System applies.
```

Do not let the optimization loop change targeting, copy, or send volume fully autonomously at launch.

## 10k Emails/Month Sizing

Assumptions:

```text
10,000 emails/month
~22 business days/month
~455 emails/day
20-30 emails per inbox per day
~18 inboxes
~6-8 domains
~3,300 unique leads/month if average sequence is 3 touches
```

Technical bottleneck:

```text
Not the server.
Not Claude.
Not Postgres.
```

Likely bottlenecks:

```text
deliverability
human closing capacity
recruiting / fulfillment capacity
quality of targeting
quality of offer/copy
```

At 10k/month, the software should handle the volume easily if the queue, retries, and dedupe layer are built from day one.

## Reliability Requirements

### Must-Haves

- webhook signature verification where providers support it
- event dedupe
- queue-based processing
- retries with backoff
- dead-letter queue for failed jobs
- Slack alerts for failures
- audit logs for important actions
- suppression list enforcement
- rate-limit handling for vendor APIs
- health check endpoint

### Failure Examples

| Failure | Correct behavior |
|---|---|
| Instantly sends webhook twice | Process once, ignore duplicate |
| HubSpot API temporarily fails | Retry later, do not lose event |
| Claude call fails | Retry or mark job failed for review |
| Slack message fails | Log + retry |
| Unknown intent | Ask human instead of guessing |
| Bounce spike | Alert + recommend pause |

## Security And Access

For the first company, all accounts can live under the company.

Recommended:

- company-owned HubSpot
- company-owned Apollo
- company-owned Instantly
- company-owned domains/inboxes
- company-owned Railway/Fly/Cloud Run project
- company-owned Anthropic account or workspace
- your admin access added explicitly

Secrets:

- store API keys in hosting environment variables
- never hardcode keys
- separate production and development keys
- rotate keys if someone leaves
- restrict admin access where possible

## Tooling

Recommended stack:

```text
Language: TypeScript
Backend: Node.js
HTTP server: Fastify or Express
Database: Postgres
Queue: pg-boss or graphile-worker
ORM/query: Prisma or Drizzle
Packaging: Docker container
Hosting: Railway, Fly.io, or Google Cloud Run
AI: Anthropic Claude API
CRM: HubSpot API
Sending: Instantly API/webhooks
Lead source: Apollo
Comms: Slack Bolt API
Monitoring: Sentry + Slack alerts
```

Hosting recommendation:

```text
Start with Railway or Fly.io if speed matters.
Use Google Cloud Run if the client wants a more enterprise cloud posture.
Keep the app containerized so it can move later.
```

## Docker / Containerization

Docker is included from the start as deployment hygiene.

It does not replace Railway, Fly.io, Cloud Run, or Postgres. Docker packages the Node service so the same app can run the same way on any host.

```
Docker container
  └── Node/TypeScript service
      ├── webhook server
      ├── cron jobs
      ├── workers
      ├── Claude wrapper
      └── vendor API clients

External services
  ├── managed Postgres
  ├── HubSpot
  ├── Instantly
  ├── Apollo
  ├── Slack
  └── Claude API
```

Why include Docker:

- same runtime locally and in production
- portable between Railway, Fly.io, Google Cloud Run, AWS, or a VPS
- avoids building the app in a Railway-specific way
- easier production deploys
- cleaner handoff if another developer maintains it later

The long-term target stays:

```text
Node/TypeScript service
Postgres database
Postgres-backed queue
Docker/containerized deploy
```

## Build Phases

### Phase 1 - Production Skeleton

Build the foundation correctly from day one.

Includes:

- Node/TypeScript backend
- Postgres
- job queue
- webhook endpoints
- Slack bot
- HubSpot client
- Instantly client
- Claude client
- basic monitoring
- env/config structure
- Dockerfile
- .dockerignore
- container health check
- production start command

Outcome:

The system can receive events, queue jobs, process safely, notify humans, and deploy as a portable container.

### Phase 2 - Reply Operations

Includes:

- Instantly reply webhook
- reply intent classification
- deal/contact creation in HubSpot
- draft response generation
- Slack hot-reply notifications
- suppression handling
- bounce/unsubscribe handling

Outcome:

Every reply is classified, documented, and routed correctly.

### Phase 3 - Lead Scoring

Includes:

- Apollo sync/import
- lead scoring rubric
- campaign mapping
- HubSpot enrichment
- queue approved leads into Instantly

Outcome:

The system can qualify lead batches before they enter sequences.

### Phase 4 - Slack Control Center

Includes:

- daily digest
- hot reply channel
- approvals channel
- errors channel
- ask-the-agent Q&A

Outcome:

Humans can operate the system from Slack without living inside every tool.

### Phase 5 - Analytics And Feedback Loops

Includes:

- daily metrics aggregation
- weekly campaign report
- lead quality loop
- copy performance loop
- deliverability loop
- recommendations with human approval

Outcome:

The system starts improving targeting, copy, and volume allocation based on outcomes.

### Phase 6 - Scale To 10k+

Includes:

- more domains/inboxes
- volume ramp schedule
- deliverability monitoring
- HubSpot rate-limit hardening
- batching/caching
- expanded reporting

Outcome:

The system can run 10k emails/month without the agent backend becoming the bottleneck.

## Operating Rhythm

Daily:

- check Slack digest
- review hot replies
- approve/edit drafted responses
- monitor errors
- check deliverability alerts

Weekly:

- review analytics report
- approve/reject recommended copy changes
- approve/reject targeting changes
- review stuck deals
- review domain/inbox health

Monthly:

- review cost
- review placements/revenue by campaign
- adjust volume
- add/remove ICPs
- decide whether to add inbox capacity

## What Makes This Optimized

The optimized design is not "Claude does everything."

The optimized design is:

```text
Code handles deterministic workflow.
Claude handles judgment.
Postgres handles memory.
HubSpot handles business truth.
Slack handles human control.
Instantly handles sending.
Apollo handles lead data.
Feedback loops handle improvement.
```

This keeps the system fast, reliable, cheap, and explainable.

## Open Decisions

Before implementation, decide:

1. Hosting: Railway, Fly.io, or Google Cloud Run.
2. Queue: pg-boss/graphile-worker on Postgres, or BullMQ + Redis.
3. Initial ICP: which US industry and role type to start with.
4. Human approval level: approve every draft, or only certain intents.
5. HubSpot pipeline stages.
6. Slack channel names.
7. Monthly target volume: launch at 5k and ramp to 10k, or begin with 10k after warmup.
8. Whether Apollo lead import is manual at first or fully automated.
9. Whether the first deploy uses Railway-managed Postgres or an external managed Postgres like Neon/Supabase.

## Final Recommendation

Build the full production foundation from day one:

```text
webhooks
cron
Postgres
queue
workers
Claude scoring/drafting
HubSpot logging
Slack control
analytics tables
deliverability monitoring
Docker/containerized deploy
```

But keep the first business workflow focused:

```text
Apollo lead data
Instantly sequencing
Agent reply handling
HubSpot documentation
Slack alerts
Human closing
```

That gives the company a real scalable system without turning launch into an unfocused platform project.
