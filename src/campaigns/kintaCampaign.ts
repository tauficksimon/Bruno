import type { InstantlyCampaignPayload } from "../integrations/instantly.js";

export const KINTA_CAMPAIGN_NAME = "Kinta Outbound Campaign - Nearshore Hiring";

const sequenceSteps = [
  {
    day: 1,
    delayFromPreviousStepDays: 0,
    subject: "Most companies are paying double what they need to on hiring",
    body: `Hi {{firstName}},

Most US companies are paying double what they need to for great talent — simply because they're hiring locally when they don't have to.

Kinta places full-time, bilingual professionals from Central America with US companies at half the cost. And that's just the starting point.

Our team works from our office. We handle everything — workspace, equipment, HR, culture, accountability, and follow-up. Your hire shows up every day, supported, managed, and committed. You don't manage any of that. We do.

You get a dedicated professional integrated into your team. We give them a career.

Worth a 15-minute call to see if there's a fit for {{companyName}}?

The Kinta team

Kinta | kintalatam.com`
  },
  {
    day: 4,
    delayFromPreviousStepDays: 3,
    subject: "What this actually looks like in practice",
    body: `Hi {{firstName}},

Following up on my last note.

Here's what a typical Kinta hire looks like: a full-time professional, working your hours, out of our managed office in Central America. Bilingual, equipped, and supported by our team on the ground — HR, culture, accountability, all handled.

Our clients don't manage a remote contractor. They add a team member. We handle everything behind that person so they can just focus on the work.

The savings — typically around 50% compared to a US hire — are almost secondary once they see how the model works.

Happy to show you a quick breakdown of how it would work for {{companyName}}.

The Kinta team

Kinta | kintalatam.com`
  },
  {
    day: 8,
    delayFromPreviousStepDays: 4,
    subject: "Not a freelancer. Not a staffing agency.",
    body: `Hi {{firstName}},

I want to be clear about what Kinta is — because it's different from most remote hiring options out there.

We're not a freelancer marketplace. We're not a staffing agency that hands you a resume and disappears. And we're not a job board.

We run a physical delivery center in Central America. Our people come to work every day — real office, real equipment, real HR. When something goes wrong, we handle it. When someone leaves, we replace them.

Your hire gets a workplace, a team, and a career path. You get the output — at half the cost of hiring locally.

That's the Kinta difference. Worth 15 minutes to walk you through it?

The Kinta team

Kinta | kintalatam.com`
  },
  {
    day: 15,
    delayFromPreviousStepDays: 7,
    subject: `"We've tried remote before" — fair enough`,
    body: `Hi {{firstName}},

A lot of founders I talk to have tried remote hiring before and it didn't stick. Usually when I dig into it, the issue wasn't the talent — it was everything around them.

No real onboarding. No one accountable when things went sideways. No culture keeping them engaged.

That's exactly what Kinta was built to solve. We don't just place someone and walk away. We build the environment around them — office, management, culture, follow-up — so they stay, perform, and grow with your team.

If that's been the hesitation for {{companyName}}, it might be worth a quick conversation just to see what's different.

The Kinta team

Kinta | kintalatam.com`
  },
  {
    day: 21,
    delayFromPreviousStepDays: 6,
    subject: "Closing your file — unless the timing's just off?",
    body: `Hi {{firstName}},

I'll stop following up after this — don't want to be noise in your inbox.

If the timing isn't right for {{companyName}}, no problem at all. If hiring costs become a priority down the road, just reply and I'll pick it back up.

And if there's someone else on your team I should be talking to about this, I'd appreciate the pointer.

Thanks either way.

The Kinta team

Kinta | kintalatam.com`
  }
];

export function buildKintaCampaignPayload(input: {
  senderEmails: string[];
  startDate?: string;
  endDate?: string;
}): InstantlyCampaignPayload {
  return {
    name: KINTA_CAMPAIGN_NAME,
    campaign_schedule: {
      schedules: [
        {
          name: "Tue-Thu mornings EST",
          timing: {
            from: "07:00",
            to: "11:00"
          },
          days: {
            "0": false,
            "1": true,
            "2": true,
            "3": true,
            "4": false,
            "5": false,
            "6": false
          },
          // Instantly's timezone enum has no "America/New_York"; "America/Detroit" is the valid US Eastern value.
          timezone: "America/Detroit"
        }
      ],
      start_date: input.startDate ?? "2026-07-07",
      end_date: input.endDate
    },
    pl_value: 100,
    is_evergreen: false,
    sequences: [
      {
        // Instantly's step `delay` = days to wait AFTER this step before the NEXT email.
        // So each step must carry the gap to the *following* email (last step = 0).
        // (delayFromPreviousStepDays is the gap *before* a step, hence the +1 lookahead.)
        steps: sequenceSteps.map((step, i) => ({
          type: "email",
          delay: sequenceSteps[i + 1]?.delayFromPreviousStepDays ?? 0,
          delay_unit: "days",
          // pre_delay only applies to subsequences and is ignored for regular campaigns.
          pre_delay: 0,
          pre_delay_unit: "days",
          variants: [
            {
              subject: step.subject,
              body: step.body,
              v_disabled: false
            }
          ]
        }))
      }
    ],
    email_gap: 15,
    random_wait_max: 15,
    text_only: true,
    first_email_text_only: true,
    email_list: input.senderEmails,
    // 400 leads/week target across 2 inboxes, sent only Tue-Thu (~3 sending days/week).
    // Do not raise past this until Email 1 reply rate holds above 3% (then scale toward 10 inboxes / 2,000 per week).
    daily_limit: 135,
    stop_on_reply: true,
    link_tracking: false,
    open_tracking: false,
    stop_on_auto_reply: false,
    daily_max_leads: 135,
    prioritize_new_leads: false,
    match_lead_esp: false,
    stop_for_company: true,
    insert_unsubscribe_header: true,
    allow_risky_contacts: false,
    disable_bounce_protect: false,
    limit_emails_per_company_override: {
      mode: "custom",
      daily_limit: 1,
      scope: "per_campaign"
    }
  };
}

export function getKintaCampaignSummary() {
  return sequenceSteps.map((step) => ({
    day: step.day,
    subject: step.subject,
    preview: step.body.split("\n\n")[1] ?? step.body
  }));
}
