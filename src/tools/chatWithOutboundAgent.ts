import "dotenv/config";
import readline from "node:readline";
import { runOutboundAgent } from "../agents/outboundAgent.js";
import type { ConversationTurn } from "../integrations/claude.js";

/**
 * Local harness to talk to the outbound agent without Slack.
 *
 *   npm run agent:chat "how is the campaign doing?"   # one-shot
 *   npm run agent:chat                                  # interactive REPL
 */

const history: ConversationTurn[] = [];

async function ask(question: string) {
  history.push({ role: "user", content: question });
  const result = await runOutboundAgent(history);
  history.push({ role: "assistant", content: result.text });

  console.log(`\n${result.text}\n`);
  if (result.toolCalls.length > 0) {
    console.log(`  ↳ tools used: ${result.toolCalls.join(", ")}\n`);
  }
}

async function main() {
  const oneShot = process.argv.slice(2).join(" ").trim();

  if (oneShot) {
    await ask(oneShot);
    return;
  }

  console.log("Outbound agent — interactive chat. Type a question, or 'exit' to quit.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (input === "exit" || input === "quit") {
      rl.close();
      return;
    }
    if (input.length === 0) {
      rl.prompt();
      return;
    }
    try {
      await ask(input);
    } catch (error) {
      console.error(`\n[error] ${error instanceof Error ? error.message : String(error)}\n`);
    }
    rl.prompt();
  });

  rl.on("close", () => process.exit(0));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
