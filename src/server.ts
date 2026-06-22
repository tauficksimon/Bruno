import Fastify from "fastify";
import cron from "node-cron";
import pino from "pino";
import { env } from "./config/env.js";
import { closePool } from "./db/pool.js";
import { enqueueJob } from "./queue/queue.js";
import { startWorkerLoop } from "./queue/worker.js";
import { registerInstantlyWebhook } from "./webhooks/instantly.js";
import { registerSlackWebhook } from "./webhooks/slack.js";

const logger = pino({ name: "server" });
const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "ai-sdr-agent",
  time: new Date().toISOString()
}));

await registerInstantlyWebhook(app);
await registerSlackWebhook(app);

cron.schedule("0 8 * * 1-5", async () => {
  await enqueueJob("daily.digest", { scheduledAt: new Date().toISOString() });
});

cron.schedule("0 9 * * 1", async () => {
  await enqueueJob("weekly.analytics", { scheduledAt: new Date().toISOString() });
});

const worker = startWorkerLoop();

const shutdown = async () => {
  logger.info("shutting down");
  worker.stop();
  await app.close();
  await closePool();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
