import {
  createInstantlyCampaign,
  listInstantlyAccounts,
  listInstantlyCampaigns,
  patchInstantlyCampaign,
  pauseInstantlyCampaign
} from "../integrations/instantly.js";
import {
  buildKintaCampaignPayload,
  getKintaCampaignSummary,
  KINTA_CAMPAIGN_NAME
} from "../campaigns/kintaCampaign.js";

interface CliOptions {
  dryRun: boolean;
  forceCreate: boolean;
  senderEmails: string[];
  startDate?: string;
  endDate?: string;
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    forceCreate: false,
    senderEmails: []
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--force-create") {
      options.forceCreate = true;
      continue;
    }

    if (arg.startsWith("--sender-email=")) {
      options.senderEmails.push(arg.slice("--sender-email=".length));
      continue;
    }

    if (arg.startsWith("--start-date=")) {
      options.startDate = arg.slice("--start-date=".length);
      continue;
    }

    if (arg.startsWith("--end-date=")) {
      options.endDate = arg.slice("--end-date=".length);
    }
  }

  return options;
}

function selectKintaSenderEmails(accounts: Awaited<ReturnType<typeof listInstantlyAccounts>>) {
  const kintaAccounts = accounts.filter((account) => account.email.toLowerCase().endsWith("@hirekinta.com"));
  const readyKintaAccounts = kintaAccounts.filter((account) => account.status === 1 && !account.setup_pending);

  if (readyKintaAccounts.length > 0) {
    return readyKintaAccounts.map((account) => account.email);
  }

  if (kintaAccounts.length > 0) {
    return kintaAccounts.map((account) => account.email);
  }

  throw new Error("No @hirekinta.com sender accounts were found in Instantly");
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const senderEmails =
    options.senderEmails.length > 0
      ? options.senderEmails
      : selectKintaSenderEmails(await listInstantlyAccounts({ includeTags: true }));
  const payload = buildKintaCampaignPayload({
    senderEmails,
    startDate: options.startDate,
    endDate: options.endDate
  });

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          campaignName: KINTA_CAMPAIGN_NAME,
          senderEmails,
          sequence: getKintaCampaignSummary(),
          payload
        },
        null,
        2
      )
    );
    return;
  }

  // "Kinta EA Pilot - US Service Businesses" is the legacy name this campaign was first created under in Instantly.
  const legacyCampaignName = "Kinta EA Pilot - US Service Businesses";
  const matchingCampaigns = options.forceCreate ? [] : await listInstantlyCampaigns({ search: "Kinta" });
  const existingCampaign = matchingCampaigns.find(
    (campaign) => campaign.name === KINTA_CAMPAIGN_NAME || campaign.name === legacyCampaignName
  );

  const campaign = existingCampaign
    ? await patchInstantlyCampaign(existingCampaign.id, payload)
    : await createInstantlyCampaign(payload);

  const pausedCampaign = await pauseInstantlyCampaign(campaign.id);

  console.log(
    JSON.stringify(
      {
        mode: existingCampaign ? "updated" : "created",
        campaignId: pausedCampaign.id,
        campaignName: pausedCampaign.name,
        campaignStatus: pausedCampaign.status,
        senderEmails,
        stepCount: payload.sequences?.[0]?.steps.length ?? 0,
        leadImport: "none",
        activation: "not called; campaign paused after write"
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
