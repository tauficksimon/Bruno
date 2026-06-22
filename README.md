# AI SDR Agent

Local scaffold for the always-on AI SDR operations layer.

## Architecture

```text
Apollo -> Instantly -> Webhooks -> Postgres queue -> Workers
                                             |
                                             v
                         Claude + HubSpot + Slack + Postgres
```

The backend does not send cold email directly. Instantly owns sequencing and delivery. The agent handles scoring, reply classification, CRM documentation, Slack notifications, drafts, metrics, and reliability.

## What Is In This Scaffold

- TypeScript backend with Fastify
- Postgres schema
- Postgres-backed job queue
- Instantly webhook endpoint
- Worker loop with retry-safe processing
- Claude wrapper
- HubSpot / Instantly / Apollo / Slack integration wrappers
- Agent modules for scoring, reply intent, drafting, analytics
- Mock webhook payloads
- `.env.example`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```bash
cp .env.example .env
```

3. Start Postgres locally and create the database named `ai_sdr_agent`.

4. Run migrations:

```bash
npm run migrate
```

5. Start the dev server:

```bash
npm run dev
```

6. Test a mock Instantly reply:

```bash
curl -X POST http://localhost:3000/webhooks/instantly \
  -H "content-type: application/json" \
  --data @mock-payloads/instantly-reply.json
```

## Docker

Build the production image:

```bash
docker build -t ai-sdr-agent .
```

Run it:

```bash
docker run --env-file .env -p 3000:3000 ai-sdr-agent
```

Railway should use the included `Dockerfile` via `railway.json`. The same container can be moved later to Fly.io, Google Cloud Run, AWS, or a VPS.

## Current Boundary

This is the local foundation. Railway/Fly/Cloud Run is only needed when we deploy and need public webhook URLs.

## Production Rules

- Webhooks should acknowledge quickly.
- Events should be stored before processing.
- Jobs should be retried safely.
- Claude should only handle judgment tasks.
- HubSpot remains the source of truth.
- Postgres stores operational memory.
- Slack is the control center.
