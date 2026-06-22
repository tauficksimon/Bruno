import { env } from "../config/env.js";

const INSTANTLY_BASE_URL = "https://api.instantly.ai";

async function instantlyFetch(path: string, init?: RequestInit) {
  if (!env.INSTANTLY_API_KEY) {
    throw new Error("INSTANTLY_API_KEY is not configured");
  }

  const response = await fetch(`${INSTANTLY_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.INSTANTLY_API_KEY}`,
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Instantly API failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<unknown>;
}

export async function stopLeadSequence(input: { email?: string; leadId?: string }) {
  if (!env.INSTANTLY_API_KEY) return;

  // TODO: replace with exact Instantly endpoint once account/API docs are available.
  // This stays isolated so only this wrapper changes.
  await instantlyFetch("/api/v2/leads/stop", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function suppressLead(input: { email?: string; leadId?: string; reason: string }) {
  if (!env.INSTANTLY_API_KEY) return;

  // TODO: replace with exact Instantly suppression endpoint once account/API docs are available.
  await instantlyFetch("/api/v2/suppressions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
