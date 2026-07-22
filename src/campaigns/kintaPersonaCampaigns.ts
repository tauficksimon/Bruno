import type { InstantlyCampaignPayload } from "../integrations/instantly.js";

export const KINTA_BOOKING_URL = "https://kinta-latam.web.app/contact";

export interface KintaPersonaCampaign {
  key: "ea" | "legal" | "developer" | "aec" | "social";
  name: string;
  persona: string;
  targetRole: string;
  workItem: string;
  firstEmailVariants: Array<{
    name: string;
    subject: string;
    body: string;
  }>;
}

const signoff = "{{sendingAccountFirstName}}";
const bookingLine = KINTA_BOOKING_URL;

export const KINTA_PERSONA_CAMPAIGNS: KintaPersonaCampaign[] = [
  {
    key: "ea",
    name: "Kinta | P1 EA | B1 | 2026-07",
    persona: "EA",
    targetRole: "Executive Assistant",
    workItem: "inbox and calendar",
    firstEmailVariants: [
      {
        name: "A — the model",
        subject: "your ea comes with an office",
        body: `Hi {{firstName}},

Every Kinta executive assistant comes with more than their skills: a desk in our office in Central America, a manager reviewing their work daily, HR down the hall, all equipment included. Your hours — GMT-6, no drift.

You hire one person. You get the whole structure behind them.

And they're saving you 15+ hours a week by day 30 — or we replace them free, and billing pauses until the seat delivers.

About half the fully-loaded cost of a US hire.

Worth a look? ${bookingLine}

${signoff}`
      },
      {
        name: "B — the outcome",
        subject: "15 hours back, every week",
        body: `Hi {{firstName}},

That's the promise, and it's contractual: your Kinta executive assistant saves you 15+ hours a week by day 30, or we replace them free — and billing pauses until the seat delivers.

One flat monthly fee covers everything: salary, office, equipment, HR, daily supervision. About half the fully-loaded cost of the same hire in the US.

They work your hours from our delivery center in Central America. Your calendar, your inbox, your follow-ups — handled.

Open to 15 minutes? ${bookingLine}

${signoff}`
      }
    ]
  },
  {
    key: "legal",
    name: "Kinta | P2 Legal | B1 | 2026-07",
    persona: "Legal",
    targetRole: "Paralegal",
    workItem: "case files",
    firstEmailVariants: [
      {
        name: "A — the model",
        subject: "your paralegal comes with an office",
        body: `Hi {{firstName}},

Every Kinta paralegal comes with more than their training: a desk in our office in Central America, a manager reviewing their work daily, HR on-site, all equipment included. Your hours — GMT-6, real-time with your team.

Bilingual, detail-driven, and carrying real casework by day 30 — or we replace them free, and billing pauses until the seat delivers.

About half the fully-loaded cost of the same hire locally. Many firms add a legal EA next — same model, same guarantee.

Worth a look? ${bookingLine}

${signoff}`
      },
      {
        name: "B — the outcome",
        subject: "billable hours back, every week",
        body: `Hi {{firstName}},

Every hour you spend on intake forms, filings, and follow-ups is an hour you can't bill. That's the hour we give back.

A Kinta paralegal handles the support work — carrying real casework by day 30, or we replace them free and billing pauses until the seat delivers.

One flat monthly fee: salary, office, equipment, HR, daily supervision, all in. About half the fully-loaded cost of hiring locally.

Open to 15 minutes? ${bookingLine}

${signoff}`
      }
    ]
  },
  {
    key: "developer",
    name: "Kinta | P3 Developer | B1 | 2026-07",
    persona: "Developer",
    targetRole: "Software Developer",
    workItem: "repo",
    firstEmailVariants: [
      {
        name: "A — the model",
        subject: "your next dev comes with an office",
        body: `Hi {{firstName}},

Every Kinta developer comes with the full setup: a desk in our office in Central America, senior oversight on the ground, HR handled, equipment included. Your hours — GMT-6, so standups, pairing, and reviews happen in real time.

Shipping production code by day 30 — or we replace them free, and billing pauses until the seat delivers.

Mid and senior levels, at roughly half the fully-loaded US cost. Most teams start with one and grow the pod from there.

Worth a look? ${bookingLine}

${signoff}`
      },
      {
        name: "B — the outcome",
        subject: "production code by day 30",
        body: `Hi {{firstName}},

That's the bar we hold ourselves to, contractually: your Kinta developer is shipping production code by day 30, or we replace them free — and billing pauses until the seat delivers.

Bilingual mid and senior engineers, working your hours from our office in Central America. Real-time collaboration all day — standups, reviews, pairing. One flat fee covers everything: salary, office, equipment, HR, oversight.

Roughly half the fully-loaded US cost per engineer. Start with one, grow the pod when it works.

Open to 15 minutes? ${bookingLine}

${signoff}`
      }
    ]
  },
  {
    key: "aec",
    name: "Kinta | P4 AEC | B1 | 2026-07",
    persona: "AEC",
    targetRole: "BIM Modeler",
    workItem: "project files",
    firstEmailVariants: [
      {
        name: "A — the model",
        subject: "we run a design firm too",
        body: `Hi {{firstName}},

Before Kinta, we built an architecture and design practice of our own — so we know exactly what a good production architect or BIM modeler is worth, and how hard they are to find.

Ours work from our office in Central America: senior review daily, HR on-site, full setup included, your hours — GMT-6, live coordination all day.

Producing deliverable drawings by day 30, or we replace them free and billing pauses until the seat delivers. About half the fully-loaded US cost.

Worth a look? ${bookingLine}

${signoff}`
      },
      {
        name: "B — the outcome",
        subject: "deliverables by day 30",
        body: `Hi {{firstName}},

That's the promise, in the contract: your Kinta architect or BIM modeler is producing deliverable drawings by day 30, or we replace them free — and billing pauses until the seat delivers.

Bilingual production talent — Revit, AutoCAD, rendering — working your hours from our office in Central America. One flat fee: salary, office, equipment, HR, daily senior review, all in.

About half the fully-loaded US cost. And we run a design practice ourselves, so the vetting is done by people who've hired for these seats before.

Open to 15 minutes? ${bookingLine}

${signoff}`
      }
    ]
  },
  {
    key: "social",
    name: "Kinta | P5 Social | B1 | 2026-07",
    persona: "Marketing",
    targetRole: "Social Media Manager",
    workItem: "content calendar",
    firstEmailVariants: [
      {
        name: "A — the model",
        subject: "your smm comes with an office",
        body: `Hi {{firstName}},

Every Kinta social media manager comes with the full setup: a desk in our office in Central America, a manager reviewing their output daily, HR on-site, equipment included. Your hours — GMT-6, so they're online when your audience is.

Bilingual, brand-trained on your voice, and running your channels on a full content calendar by day 30 — or we replace them free, and billing pauses until the seat delivers.

About half the fully-loaded cost of the same hire in the US. Many brands add a designer next — same model, same guarantee.

Worth a look? ${bookingLine}

${signoff}`
      },
      {
        name: "B — the outcome",
        subject: "content out, every week",
        body: `Hi {{firstName}},

The hardest part of social isn't ideas — it's consistency. Posting every week, every channel, on brand, without it eating your team's time.

That's the seat we fill: a full-time Kinta social media manager, running your channels on a full content calendar by day 30 — or we replace them free, and billing pauses until the seat delivers.

One flat monthly fee: salary, office, equipment, HR, daily supervision, all in. About half the fully-loaded US cost.

Open to 15 minutes? ${bookingLine}

${signoff}`
      }
    ]
  }
];

function sharedFollowups(persona: KintaPersonaCampaign) {
  const role = persona.targetRole.toLowerCase();
  const work = `your ${persona.workItem}`;

  return [
    {
      subject: "8am, your time",
      body: `Hi {{firstName}},

Here's what the model looks like on a Tuesday: your ${role} is at their desk in our office by 8am your time. Equipment set up, manager nearby, HR down the hall. They open ${work} and get to it.

To your team, they're one more person on Slack. Behind them, there's a whole structure keeping the work on track — that part's on us.

One flat fee, everything included, about half the fully-loaded US cost.

Worth seeing how it would fit {{companyName}}? ${bookingLine}

${signoff}`
    },
    {
      subject: "the question we kept getting",
      body: `Hi {{firstName}},

US founders who visited our companies kept asking the same thing: where do you find these people?

Honest answer: we spent 15 years building businesses — fintech, manufacturing, architecture — and hired bilingual talent in Central America for our own teams. Real office, real support, real careers. It became the best part of how we operated.

Kinta is that system, opened up to US companies. Full-time professionals, working your hours, with everything handled behind them — and productive by day 30, guaranteed, or billing pauses.

Worth a look? ${bookingLine}

${signoff}`
    },
    {
      subject: "ten founding clients",
      body: `Hi {{firstName}},

We're taking ten founding clients this year. Not a discount program — full price, and in exchange for a case study and a couple of intros, founding clients get us: both founders on your calls, direct access, and first priority on talent.

Every seat comes with the same promise: fully productive by day 30, or we replace them free and billing pauses until it delivers.

If {{companyName}} might want one, this is the right moment.

Open to 15 minutes? ${bookingLine}

${signoff}`
    },
    {
      subject: "closing your file",
      body: `Hi {{firstName}},

I'll stop here — don't want to be noise in your inbox.

If the timing isn't right for {{companyName}}, no problem at all. If it changes, just reply and I'll pick it back up — the day-30 guarantee will still be here.

And if someone else on your team owns hiring, I'd appreciate the pointer.

Thanks either way.

${signoff}`
    }
  ];
}

export function buildKintaPersonaCampaignPayload(input: {
  persona: KintaPersonaCampaign;
  senderEmails: string[];
  startDate?: string;
}): InstantlyCampaignPayload {
  const followups = sharedFollowups(input.persona);
  const steps = [
    {
      delay: 3,
      variants: input.persona.firstEmailVariants.map((variant) => ({
        subject: variant.subject,
        body: variant.body,
        v_disabled: false
      }))
    },
    ...followups.map((followup, index) => ({
      delay: [4, 7, 6, 0][index],
      variants: [{ subject: followup.subject, body: followup.body, v_disabled: false }]
    }))
  ];

  return {
    name: input.persona.name,
    campaign_schedule: {
      schedules: [
        {
          name: "Weekday mornings EST",
          timing: { from: "07:00", to: "11:00" },
          // Instantly indexes Monday as 0; send Monday-Friday only.
          days: {
            "0": true,
            "1": true,
            "2": true,
            "3": true,
            "4": true,
            "5": false,
            "6": false
          },
          timezone: "America/Detroit"
        }
      ],
      start_date: input.startDate ?? "2026-07-27"
    },
    pl_value: 100,
    is_evergreen: false,
    sequences: [
      {
        steps: steps.map((step) => ({
          type: "email" as const,
          delay: step.delay,
          delay_unit: "days" as const,
          pre_delay: 0,
          pre_delay_unit: "days" as const,
          variants: step.variants
        }))
      }
    ],
    email_gap: 15,
    random_wait_max: 15,
    text_only: true,
    first_email_text_only: true,
    email_list: input.senderEmails,
    // Five campaigns x 16 emails/day = 80/day total = 20/day per inbox.
    daily_limit: 16,
    daily_max_leads: 16,
    stop_on_reply: true,
    link_tracking: false,
    open_tracking: false,
    stop_on_auto_reply: false,
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

export function getKintaPersonaCampaignSummary() {
  return KINTA_PERSONA_CAMPAIGNS.map((persona) => {
    const payload = buildKintaPersonaCampaignPayload({ persona, senderEmails: [] });
    return {
      key: persona.key,
      name: persona.name,
      persona: persona.persona,
      targetRole: persona.targetRole,
      firstEmailSubjects: persona.firstEmailVariants.map((variant) => variant.subject),
      followupSubjects: payload.sequences?.[0]?.steps.slice(1).map((step) => step.variants[0]?.subject)
    };
  });
}
