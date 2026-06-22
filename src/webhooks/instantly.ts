import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import { env } from "../config/env.js";
import { recordEvent } from "../db/events.js";
import { enqueueJob } from "../queue/queue.js";
import { normalizeInstantlyEvent } from "./normalizeInstantlyEvent.js";

export async function registerInstantlyWebhook(app: FastifyInstance) {
  app.post("/webhooks/instantly", async (request, reply) => {
    const rawBody = JSON.stringify(request.body ?? {});

    if (!verifyInstantlySignature(rawBody, request.headers)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    const event = normalizeInstantlyEvent(request.body);
    const recorded = await recordEvent({
      provider: event.provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event.raw
    });

    if (recorded.inserted) {
      await enqueueJob("instantly.event.received", {
        eventId: recorded.id,
        event
      });
    }

    return reply.code(202).send({ accepted: true, duplicate: !recorded.inserted });
  });
}

function verifyInstantlySignature(rawBody: string, headers: IncomingHttpHeaders) {
  if (!env.INSTANTLY_WEBHOOK_SECRET) return true;

  const signature = String(headers["x-instantly-signature"] ?? "");
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", env.INSTANTLY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
