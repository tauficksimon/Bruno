import { env } from "../config/env.js";

const APOLLO_BASE_URL = "https://api.apollo.io";

async function apolloFetch(path: string, init?: RequestInit) {
  if (!env.APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY is not configured");
  }

  const response = await fetch(`${APOLLO_BASE_URL}${path}`, {
    ...init,
    headers: {
      "x-api-key": env.APOLLO_API_KEY,
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Apollo API failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<unknown>;
}

export async function searchLeads(filters: unknown) {
  if (!env.APOLLO_API_KEY) {
    return [];
  }

  // TODO: tune filters once the initial ICP is selected.
  return apolloFetch("/api/v1/mixed_people/search", {
    method: "POST",
    body: JSON.stringify(filters)
  });
}
