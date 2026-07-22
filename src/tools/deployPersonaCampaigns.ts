import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  addLeadsToInstantlyCampaign,
  countCampaignLeads,
  createInstantlyCampaign,
  listLeadRecordsPage,
  listInstantlyAccounts,
  listInstantlyCampaigns,
  patchInstantlyCampaign,
  pauseInstantlyCampaign,
  type InstantlyLeadImport
} from "../integrations/instantly.js";
import {
  buildKintaPersonaCampaignPayload,
  getKintaPersonaCampaignSummary,
  KINTA_PERSONA_CAMPAIGNS
} from "../campaigns/kintaPersonaCampaigns.js";

interface ManifestPersona {
  key: string;
  campaignName: string;
  persona: string;
  targetRole: string;
  workItem: string;
  leadCount: number;
  leads: InstantlyLeadImport[];
}

interface ImportManifest {
  batch: string;
  totalLeadCount: number;
  personas: ManifestPersona[];
}

interface CliOptions {
  apply: boolean;
  importLeads: boolean;
  startDate?: string;
}

function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false, importLeads: false };
  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--import-leads") options.importLeads = true;
    else if (arg.startsWith("--start-date=")) options.startDate = arg.slice("--start-date=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.importLeads && !options.apply) {
    throw new Error("--import-leads requires --apply");
  }
  return options;
}

async function readManifest(): Promise<ImportManifest> {
  const path = resolve(process.cwd(), "new-campaign/instantly-imports/manifest.json");
  return JSON.parse(await readFile(path, "utf8")) as ImportManifest;
}

function selectReadySenders(accounts: Awaited<ReturnType<typeof listInstantlyAccounts>>) {
  const allowedDomains = ["@hirekinta.com", "@workwithkinta.com"];
  const senders = accounts
    .filter(
      (account) =>
        allowedDomains.some((domain) => account.email.toLowerCase().endsWith(domain)) &&
        account.status === 1 &&
        !account.setup_pending
    )
    .map((account) => account.email)
    .sort();

  if (senders.length !== 4) {
    throw new Error(`Expected exactly four ready Kinta sender accounts; found ${senders.length}: ${senders.join(", ")}`);
  }
  return senders;
}

function validateManifest(manifest: ImportManifest) {
  const expectedKeys = new Set(KINTA_PERSONA_CAMPAIGNS.map((persona) => persona.key));
  const actualKeys = new Set(manifest.personas.map((persona) => persona.key));
  if (expectedKeys.size !== actualKeys.size || [...expectedKeys].some((key) => !actualKeys.has(key))) {
    throw new Error("The import manifest does not contain exactly the five configured personas");
  }

  const count = manifest.personas.reduce((sum, persona) => sum + persona.leads.length, 0);
  if (count !== manifest.totalLeadCount) {
    throw new Error(`Manifest count mismatch: header=${manifest.totalLeadCount}, rows=${count}`);
  }

  const emails = manifest.personas.flatMap((persona) => persona.leads.map((lead) => lead.email.toLowerCase()));
  if (new Set(emails).size !== emails.length) {
    throw new Error("The import manifest contains duplicate email addresses");
  }

  for (const persona of KINTA_PERSONA_CAMPAIGNS) {
    const entry = manifest.personas.find((candidate) => candidate.key === persona.key);
    if (!entry || entry.campaignName !== persona.name || entry.leadCount !== entry.leads.length) {
      throw new Error(`Manifest metadata does not match campaign configuration for ${persona.key}`);
    }
    for (const lead of entry.leads) {
      if (
        lead.custom_variables?.persona !== persona.persona ||
        lead.custom_variables?.targetRole !== persona.targetRole ||
        lead.custom_variables?.workItem !== persona.workItem
      ) {
        throw new Error(`Lead persona metadata mismatch in ${persona.key}: ${lead.email}`);
      }
    }
  }
}

async function existingCampaignEmails(campaignId: string) {
  const emails = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listLeadRecordsPage({ campaignId, limit: 100, startingAfter: cursor });
    for (const lead of page.leads) emails.add(lead.email.toLowerCase());
    cursor = page.nextStartingAfter;
  } while (cursor);
  return emails;
}

function remainingUploadCredits(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.toLowerCase().includes("lead limit reached")) return undefined;
  const match = message.match(/uploads:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const manifest = await readManifest();
  validateManifest(manifest);

  const accounts = await listInstantlyAccounts({ limit: 100, includeTags: true });
  const senderEmails = selectReadySenders(accounts);

  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          batch: manifest.batch,
          totalLeadCount: manifest.totalLeadCount,
          senderEmails,
          campaigns: getKintaPersonaCampaignSummary().map((campaign) => ({
            ...campaign,
            leadCount: manifest.personas.find((persona) => persona.key === campaign.key)?.leadCount
          })),
          writeActions: "none"
        },
        null,
        2
      )
    );
    return;
  }

  const existingCampaigns = await listInstantlyCampaigns({ search: "Kinta", limit: 100 });
  const results: Array<Record<string, unknown>> = [];

  for (const persona of KINTA_PERSONA_CAMPAIGNS) {
    const manifestPersona = manifest.personas.find((entry) => entry.key === persona.key);
    if (!manifestPersona) throw new Error(`Missing manifest entry for ${persona.key}`);

    const payload = buildKintaPersonaCampaignPayload({
      persona,
      senderEmails,
      startDate: options.startDate
    });
    const existing = existingCampaigns.find((campaign) => campaign.name === persona.name);
    const written = existing
      ? await patchInstantlyCampaign(existing.id, payload)
      : await createInstantlyCampaign(payload);
    const paused = await pauseInstantlyCampaign(written.id);

    const result: Record<string, unknown> = {
      key: persona.key,
      mode: existing ? "updated" : "created",
      campaignId: paused.id,
      campaignName: paused.name,
      status: paused.status,
      configuredLeadCount: manifestPersona.leadCount,
      senderEmails,
      stepCount: payload.sequences?.[0]?.steps.length ?? 0,
      firstStepVariantCount: payload.sequences?.[0]?.steps[0]?.variants.length ?? 0
    };

    if (options.importLeads) {
      const existingEmails = await existingCampaignEmails(paused.id);
      const missingLeads = manifestPersona.leads.filter((lead) => !existingEmails.has(lead.email.toLowerCase()));
      result.leadsBeforeImport = existingEmails.size;
      result.missingBeforeImport = missingLeads.length;

      if (missingLeads.length === 0) {
        result.import = { status: "already-complete", leads_uploaded: 0 };
      } else {
        try {
          result.import = await addLeadsToInstantlyCampaign({
            campaignId: paused.id,
            leads: missingLeads,
            skipIfInWorkspace: true
          });
        } catch (error) {
          const remaining = remainingUploadCredits(error);
          if (remaining === undefined) throw error;
          if (remaining === 0) {
            result.import = {
              status: "blocked-by-plan-limit",
              leads_uploaded: 0,
              uploadCreditsRemaining: 0,
              leadsStillQueued: missingLeads.length
            };
          } else {
            const partialLeads = missingLeads.slice(0, remaining);
            const partial = await addLeadsToInstantlyCampaign({
              campaignId: paused.id,
              leads: partialLeads,
              skipIfInWorkspace: true
            });
            result.import = {
              ...partial,
              status: "partial-plan-limit",
              uploadCreditsAvailableBeforeImport: remaining,
              leadsStillQueued: missingLeads.length - partial.leads_uploaded
            };
          }
        }
      }
      result.leadsAfterImport = await countCampaignLeads({
        campaignId: paused.id,
        maxPages: 20,
        pageSize: 100
      });
    }

    results.push(result);
  }

  console.log(
    JSON.stringify(
      {
        mode: options.importLeads ? "campaigns-and-leads-written" : "campaigns-written",
        activation: "not called; every campaign paused after write",
        results
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
