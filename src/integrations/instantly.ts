import { env } from "../config/env.js";

const INSTANTLY_BASE_URL = "https://api.instantly.ai";

async function instantlyFetch(path: string, init?: RequestInit) {
  if (!env.INSTANTLY_API_KEY) {
    throw new Error("INSTANTLY_API_KEY is not configured");
  }

  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${env.INSTANTLY_API_KEY}`);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${INSTANTLY_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw new Error(`Instantly API failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<unknown>;
}

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function itemsFromListResponse<T extends object>(response: unknown): T[] {
  if (!response || typeof response !== "object" || !("items" in response)) {
    throw new Error("Instantly API returned an unexpected list response");
  }

  const { items } = response as { items: unknown };
  if (!Array.isArray(items)) {
    throw new Error("Instantly API returned an unexpected items payload");
  }

  return items as T[];
}

export interface InstantlyAccount {
  email: string;
  status?: number;
  setup_pending?: boolean;
  stat_warmup_score?: number;
}

export interface InstantlyCampaign {
  id: string;
  name: string;
  status?: number;
  email_list?: string[];
  timestamp_updated?: string;
}

export interface InstantlyCampaignPayload {
  name: string;
  campaign_schedule: {
    schedules: Array<{
      name: string;
      timing: {
        from: string;
        to: string;
      };
      days: Record<string, boolean>;
      timezone: string;
    }>;
    start_date?: string;
    end_date?: string;
  };
  pl_value?: number | null;
  is_evergreen?: boolean | null;
  sequences?: Array<{
    steps: Array<{
      type: "email";
      delay: number;
      delay_unit: "days";
      pre_delay: number;
      pre_delay_unit: "days";
      variants: Array<{
        subject: string;
        body: string;
        v_disabled?: boolean;
      }>;
    }>;
  }>;
  email_gap?: number | null;
  random_wait_max?: number | null;
  text_only?: boolean | null;
  first_email_text_only?: boolean | null;
  email_list?: string[];
  daily_limit?: number | null;
  stop_on_reply?: boolean | null;
  link_tracking?: boolean | null;
  open_tracking?: boolean;
  stop_on_auto_reply?: boolean | null;
  daily_max_leads?: number | null;
  prioritize_new_leads?: boolean | null;
  match_lead_esp?: boolean | null;
  stop_for_company?: boolean | null;
  insert_unsubscribe_header?: boolean | null;
  allow_risky_contacts?: boolean | null;
  disable_bounce_protect?: boolean | null;
  limit_emails_per_company_override?: {
    mode: "custom" | "disabled";
    daily_limit: number;
    scope?: "per_campaign" | "across_workspace";
  };
}

export async function listInstantlyAccounts(input: { limit?: number; includeTags?: boolean } = {}) {
  const response = await instantlyFetch(
    `/api/v2/accounts${queryString({
      limit: input.limit ?? 100,
      include_tags: input.includeTags
    })}`
  );

  return itemsFromListResponse<InstantlyAccount>(response);
}

export async function listInstantlyCampaigns(input: { search?: string; limit?: number } = {}) {
  const response = await instantlyFetch(
    `/api/v2/campaigns${queryString({
      limit: input.limit ?? 100,
      search: input.search
    })}`
  );

  return itemsFromListResponse<InstantlyCampaign>(response);
}

export async function getInstantlyCampaign(id: string) {
  return instantlyFetch(`/api/v2/campaigns/${id}`) as Promise<InstantlyCampaign & { campaign_schedule?: unknown }>;
}

// ---------------------------------------------------------------------------
// Read layer — the outbound agent's live "eyes" into the Instantly account.
// Every endpoint below was verified against the live v2 API during setup.
// ---------------------------------------------------------------------------

export interface InstantlyCampaignAnalyticsOverview {
  open_count: number;
  open_count_unique: number;
  reply_count: number;
  reply_count_unique: number;
  link_click_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  emails_sent_count: number;
  contacted_count: number;
  new_leads_contacted_count: number;
  total_opportunities: number;
  total_opportunity_value: number;
  total_interested?: number;
  total_meeting_booked?: number;
  total_meeting_completed?: number;
  total_closed?: number;
}

/** Aggregate performance for one campaign (sent, opens, replies, bounces, opportunities). */
export async function getCampaignAnalyticsOverview(
  input: string | { campaignId?: string; startDate?: string; endDate?: string }
) {
  const params = typeof input === "string" ? { campaignId: input } : input;
  const response = await instantlyFetch(
    `/api/v2/campaigns/analytics/overview${queryString({
      id: params.campaignId,
      start_date: params.startDate,
      end_date: params.endDate
    })}`
  );
  return response as InstantlyCampaignAnalyticsOverview;
}

export interface InstantlyEmailSummary {
  id?: string;
  messageId?: string;
  timestampCreated?: string;
  timestampEmail?: string;
  subject?: string;
  fromEmail?: string;
  toEmail?: string;
  leadEmail?: string;
  leadId?: string;
  campaignId?: string;
  threadId?: string;
  eaccount?: string;
  preview?: string;
  threadText?: string;
  raw?: unknown;
}

function normalizeEmail(raw: unknown): InstantlyEmailSummary {
  const e = (raw ?? {}) as Record<string, unknown>;
  const body = (e.body ?? {}) as Record<string, unknown>;
  const bodyText = typeof body.text === "string" ? body.text : "";
  const bodyHtml = typeof body.html === "string" ? body.html : "";
  const preview = typeof e.content_preview === "string" ? e.content_preview : "";
  const text = bodyText || stripHtml(bodyHtml) || preview;
  const toList = e.to_address_email_list;
  return {
    id: typeof e.id === "string" ? e.id : undefined,
    messageId: typeof e.message_id === "string" ? e.message_id : undefined,
    timestampCreated: typeof e.timestamp_created === "string" ? e.timestamp_created : undefined,
    timestampEmail: typeof e.timestamp_email === "string" ? e.timestamp_email : undefined,
    subject: typeof e.subject === "string" ? e.subject : undefined,
    fromEmail: typeof e.from_address_email === "string" ? e.from_address_email : undefined,
    toEmail: typeof toList === "string" ? toList : Array.isArray(toList) ? String(toList[0] ?? "") : undefined,
    leadEmail: typeof e.lead === "string" ? e.lead : typeof e.from_address_email === "string" ? e.from_address_email : undefined,
    leadId: typeof e.lead_id === "string" ? e.lead_id : undefined,
    campaignId: typeof e.campaign_id === "string" ? e.campaign_id : undefined,
    threadId: typeof e.thread_id === "string" ? e.thread_id : undefined,
    eaccount: typeof e.eaccount === "string" ? e.eaccount : undefined,
    preview: text ? normalizeWhitespace(text).slice(0, 280) : undefined,
    threadText: text ? normalizeWhitespace(text) : undefined,
    raw
  };
}

/** Recent inbound replies for a campaign (email_type=received), newest first. */
export async function listRecentReplies(input: {
  campaignId?: string;
  limit?: number;
  latestOfThread?: boolean;
  minTimestampCreated?: string;
} = {}) {
  const response = await instantlyFetch(
    `/api/v2/emails${queryString({
      campaign_id: input.campaignId,
      email_type: "received",
      limit: input.limit ?? 20,
      sort_order: "desc",
      latest_of_thread: input.latestOfThread ?? true,
      min_timestamp_created: input.minTimestampCreated
    })}`
  );
  return itemsFromListResponse<Record<string, unknown>>(response).map(normalizeEmail);
}

export interface InstantlyLeadSummary {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  status?: number;
}

function normalizeLead(raw: unknown): InstantlyLeadSummary {
  const l = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof l.id === "string" ? l.id : undefined,
    email: typeof l.email === "string" ? l.email : undefined,
    firstName: typeof l.first_name === "string" ? l.first_name : undefined,
    lastName: typeof l.last_name === "string" ? l.last_name : undefined,
    companyName: typeof l.company_name === "string" ? l.company_name : undefined,
    status: typeof l.status === "number" ? l.status : undefined
  };
}

async function fetchLeadsPage(campaignId: string, limit: number, startingAfter?: string) {
  const response = (await instantlyFetch("/api/v2/leads/list", {
    method: "POST",
    body: JSON.stringify({ campaign: campaignId, limit, starting_after: startingAfter })
  })) as { items?: unknown; next_starting_after?: string };
  const items = Array.isArray(response.items) ? response.items : [];
  return { items, nextStartingAfter: response.next_starting_after };
}

/** A page of leads in a campaign. */
export async function listCampaignLeads(input: { campaignId: string; limit?: number }) {
  const { items } = await fetchLeadsPage(input.campaignId, input.limit ?? 25);
  return items.map(normalizeLead);
}

/**
 * Count leads in a campaign by paging (bounded so a huge list can't run away).
 * Returns the count and whether the cap was hit.
 */
export async function countCampaignLeads(input: { campaignId: string; maxPages?: number; pageSize?: number }) {
  const pageSize = input.pageSize ?? 100;
  const maxPages = input.maxPages ?? 20;
  let count = 0;
  let cursor: string | undefined;
  let pages = 0;

  do {
    const { items, nextStartingAfter } = await fetchLeadsPage(input.campaignId, pageSize, cursor);
    count += items.length;
    cursor = nextStartingAfter;
    pages += 1;
  } while (cursor && pages < maxPages);

  return { count, capped: Boolean(cursor) };
}

export interface InstantlyLeadEngagement {
  email: string;
  openCount: number;
  clickCount: number;
  replyCount: number;
  /** 1 active · 2 paused · 3 finished · -1 bounced · -2 unsubscribed · -3 skipped */
  status?: number;
  lastContactAt?: string;
  lastStepId?: string;
  lastStepFrom?: string;
}

export function leadStatusLabel(status?: number) {
  switch (status) {
    case 1: return "in sequence";
    case 2: return "sequence paused";
    case 3: return "sequence finished";
    case -1: return "bounced";
    case -2: return "unsubscribed";
    case -3: return "skipped";
    default: return undefined;
  }
}

/** Per-lead engagement counters straight off the Instantly lead record. */
export async function getLeadEngagement(input: { email: string; campaignId?: string }): Promise<InstantlyLeadEngagement | undefined> {
  const response = (await instantlyFetch("/api/v2/leads/list", {
    method: "POST",
    body: JSON.stringify({ search: input.email, campaign: input.campaignId, limit: 5 })
  })) as { items?: unknown };
  const items = Array.isArray(response.items) ? (response.items as Array<Record<string, unknown>>) : [];
  const match = items.find((l) => typeof l.email === "string" && l.email.toLowerCase() === input.email.toLowerCase());
  if (!match) return undefined;

  const summary = (match.status_summary ?? {}) as { lastStep?: { from?: string; stepID?: string } };
  return {
    email: input.email,
    openCount: typeof match.email_open_count === "number" ? match.email_open_count : 0,
    clickCount: typeof match.email_click_count === "number" ? match.email_click_count : 0,
    replyCount: typeof match.email_reply_count === "number" ? match.email_reply_count : 0,
    status: typeof match.status === "number" ? match.status : undefined,
    lastContactAt: typeof match.timestamp_last_contact === "string" ? match.timestamp_last_contact : undefined,
    lastStepId: typeof summary.lastStep?.stepID === "string" ? summary.lastStep.stepID : undefined,
    lastStepFrom: typeof summary.lastStep?.from === "string" ? summary.lastStep.from : undefined
  };
}

export interface InstantlyWarmupDay {
  date: string;
  sent: number;
  landedInbox: number;
  received: number;
}

export interface InstantlyWarmupSummary {
  email: string;
  today?: InstantlyWarmupDay;
  last7DaysSent: number;
  inboxLandingRate: number;
}

/** Per-inbox warmup health: today's warmup volume, 7-day totals, inbox-landing rate. */
export async function getWarmupAnalytics(emails: string[]): Promise<InstantlyWarmupSummary[]> {
  const response = (await instantlyFetch("/api/v2/accounts/warmup-analytics", {
    method: "POST",
    body: JSON.stringify({ emails })
  })) as { email_date_data?: Record<string, Record<string, { sent?: number; landed_inbox?: number; received?: number }>> };

  const perEmail = response.email_date_data ?? {};
  return emails.map((email) => {
    const days = perEmail[email] ?? {};
    const sortedDates = Object.keys(days).sort();
    const last7 = sortedDates.slice(-7);
    const last7DaysSent = last7.reduce((sum, d) => sum + (days[d]?.sent ?? 0), 0);
    const last7DaysLanded = last7.reduce((sum, d) => sum + (days[d]?.landed_inbox ?? 0), 0);
    const latest = sortedDates[sortedDates.length - 1];
    return {
      email,
      today: latest
        ? {
            date: latest,
            sent: days[latest]?.sent ?? 0,
            landedInbox: days[latest]?.landed_inbox ?? 0,
            received: days[latest]?.received ?? 0
          }
        : undefined,
      last7DaysSent,
      inboxLandingRate: last7DaysSent > 0 ? last7DaysLanded / last7DaysSent : 1
    };
  });
}

export async function createInstantlyCampaign(payload: InstantlyCampaignPayload) {
  return instantlyFetch("/api/v2/campaigns", {
    method: "POST",
    body: JSON.stringify(payload)
  }) as Promise<InstantlyCampaign>;
}

export async function patchInstantlyCampaign(id: string, payload: InstantlyCampaignPayload) {
  return instantlyFetch(`/api/v2/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  }) as Promise<InstantlyCampaign>;
}

export async function pauseInstantlyCampaign(id: string) {
  return instantlyFetch(`/api/v2/campaigns/${id}/pause`, {
    method: "POST"
  }) as Promise<InstantlyCampaign>;
}

/**
 * Reply to a received email from one of our inboxes.
 * NOT yet verified against the live v2 API (no real replies existed at build
 * time) — verify the field names on the first live send before trusting it.
 */
export async function sendReplyEmail(input: {
  replyToUuid: string;
  eaccount: string;
  subject: string;
  bodyText: string;
}) {
  return instantlyFetch("/api/v2/emails/reply", {
    method: "POST",
    body: JSON.stringify({
      reply_to_uuid: input.replyToUuid,
      eaccount: input.eaccount,
      subject: input.subject,
      body: {
        text: input.bodyText
      }
    })
  });
}

export async function stopLeadSequence(input: { email?: string; leadId?: string; campaignId?: string }) {
  if (!env.INSTANTLY_API_KEY) return;
  if (!input.email) {
    throw new Error("Cannot update Instantly lead interest status without a lead email");
  }

  await instantlyFetch("/api/v2/leads/update-interest-status", {
    method: "POST",
    body: JSON.stringify({
      lead_email: input.email,
      interest_value: 1,
      campaign_id: input.campaignId
    })
  });
}

export async function suppressLead(input: { email?: string; leadId?: string; reason: string }) {
  if (!env.INSTANTLY_API_KEY) return;
  if (!input.email) {
    throw new Error("Cannot create Instantly block-list entry without an email");
  }

  await instantlyFetch("/api/v2/block-lists-entries", {
    method: "POST",
    body: JSON.stringify({
      bl_value: input.email
    })
  });
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
