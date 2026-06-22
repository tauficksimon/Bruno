import { env } from "../config/env.js";
import type { DraftedReply, HubSpotUpsertResult, ReplyClassification } from "../types/domain.js";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

async function hubspotFetch(path: string, init?: RequestInit) {
  if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
    throw new Error("HUBSPOT_PRIVATE_APP_TOKEN is not configured");
  }

  const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HubSpot API failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<unknown>;
}

export async function upsertReplyContext(input: {
  email?: string;
  companyName?: string;
  classification: ReplyClassification;
  draft?: DraftedReply;
  rawThread?: string;
}): Promise<HubSpotUpsertResult> {
  if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
    return {};
  }

  // Placeholder for first live wiring:
  // 1. search contact by email
  // 2. upsert company
  // 3. create/update deal based on intent
  // 4. add timeline note with classification/draft
  await hubspotFetch("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: [
          `Agent classification: ${input.classification.intent}`,
          `Confidence: ${input.classification.confidence}`,
          `Reason: ${input.classification.reason}`,
          input.draft ? `Draft:\n${input.draft.body}` : undefined
        ]
          .filter(Boolean)
          .join("\n\n"),
        hs_timestamp: new Date().toISOString()
      }
    })
  });

  return {};
}

export async function fetchCompanyOrDealContext(query: string) {
  if (!env.HUBSPOT_PRIVATE_APP_TOKEN) {
    return { note: "HubSpot token is not configured.", query };
  }

  return hubspotFetch("/crm/v3/objects/companies/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              operator: "CONTAINS_TOKEN",
              value: query
            }
          ]
        }
      ],
      limit: 5
    })
  });
}
