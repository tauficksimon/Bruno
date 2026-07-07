import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import { env, isProduction } from "../config/env.js";
import { recordEvent } from "../db/events.js";
import { enqueueJob } from "../queue/queue.js";

interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
}

interface SlackEventEnvelope {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: SlackEvent;
}

export async function registerSlackWebhook(app: FastifyInstance) {
  app.post("/webhooks/slack/events", async (request, reply) => {
    const rawBody = (request as unknown as { rawBody?: string }).rawBody ?? "";
    const body = (request.body ?? {}) as SlackEventEnvelope;

    // 1. Confirm the request genuinely came from Slack.
    if (!verifySlackSignature(rawBody, request.headers)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    // 2. URL verification handshake — echo the challenge back.
    if (body.type === "url_verification") {
      return reply.send({ challenge: body.challenge });
    }

    // 3. Only event callbacks carry messages.
    const event = body.event;
    if (body.type !== "event_callback" || !event) {
      return reply.code(202).send({ accepted: true });
    }

    // Only respond to @-mentions in channels and direct messages. Ignore
    // anything the bot itself posted (bot_id / subtype) to avoid reply loops.
    const isMention = event.type === "app_mention";
    const isDirectMessage = event.type === "message" && event.channel_type === "im";
    if (event.bot_id || event.subtype || (!isMention && !isDirectMessage) || !event.channel) {
      return reply.code(202).send({ accepted: true });
    }

    // 4. Dedupe — Slack retries deliveries; event_id is unique per event.
    if (body.event_id) {
      const recorded = await recordEvent({
        provider: "slack",
        providerEventId: body.event_id,
        eventType: event.type ?? "unknown",
        payload: body
      });
      if (!recorded.inserted) {
        return reply.code(202).send({ accepted: true, duplicate: true });
      }
    }

    const text = stripMentions(event.text ?? "");
    if (text.length === 0) {
      return reply.code(202).send({ accepted: true });
    }

    const threadTs = event.thread_ts ?? event.ts;
    const threadKey = `${event.channel}:${threadTs ?? "root"}`;

    await enqueueJob("outbound.agent.reply", {
      threadKey,
      channel: event.channel,
      threadTs,
      text
    });

    // 5. Ack fast (Slack requires <3s). The worker posts the answer in-thread.
    return reply.code(202).send({ accepted: true });
  });
}

function verifySlackSignature(rawBody: string, headers: IncomingHttpHeaders): boolean {
  if (!env.SLACK_SIGNING_SECRET) {
    // No signing secret configured (local/dev). Must be set in production.
    return !isProduction;
  }

  const timestamp = String(headers["x-slack-request-timestamp"] ?? "");
  const signature = String(headers["x-slack-signature"] ?? "");
  if (!timestamp || !signature) return false;

  // Replay protection: reject requests older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", env.SLACK_SIGNING_SECRET).update(base).digest("hex")}`;

  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function stripMentions(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
