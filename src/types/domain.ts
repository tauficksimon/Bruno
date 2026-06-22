export type ReplyIntent =
  | "positive"
  | "question"
  | "objection"
  | "not_now"
  | "negative"
  | "unsubscribe"
  | "unclear";

export type LeadTier = 1 | 2 | 3 | 4 | 5;

export interface InstantlyEvent {
  provider: "instantly";
  providerEventId: string;
  eventType: string;
  email?: string;
  companyName?: string;
  campaignId?: string;
  leadId?: string;
  threadText?: string;
  raw: unknown;
}

export interface ReplyClassification {
  intent: ReplyIntent;
  confidence: number;
  reason: string;
  suggestedNextAction: string;
}

export interface DraftedReply {
  subject?: string;
  body: string;
  internalReason: string;
}

export interface LeadScore {
  score: number;
  tier: LeadTier;
  reason: string;
  recommendedCampaign?: string;
}

export interface HubSpotUpsertResult {
  contactId?: string;
  companyId?: string;
  dealId?: string;
}
