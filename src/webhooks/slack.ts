import type { FastifyInstance } from "fastify";
import { fetchCompanyOrDealContext } from "../integrations/hubspot.js";
import { postSlackMessage } from "../integrations/slack.js";

export async function registerSlackWebhook(app: FastifyInstance) {
  app.post("/webhooks/slack/events", async (request, reply) => {
    // Placeholder for Slack event subscriptions / slash commands.
    // Full signing verification should be added when the Slack app is created.
    const body = request.body as Record<string, unknown>;

    if (body.type === "url_verification") {
      return reply.send({ challenge: body.challenge });
    }

    return reply.code(202).send({ accepted: true });
  });

  app.post("/dev/slack/ask", async (request, reply) => {
    const body = request.body as { question?: string; channel?: string };
    const question = body.question ?? "";
    const context = await fetchCompanyOrDealContext(question);
    const answer = `Context fetched for: ${question}\n\n${JSON.stringify(context).slice(0, 1500)}`;

    if (body.channel) {
      await postSlackMessage(body.channel, answer);
    }

    return reply.send({ answer });
  });
}
