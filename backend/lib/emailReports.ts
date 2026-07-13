import {
  buildRequityReportHtml,
  buildRequityReportText,
  agentDashboardUrl,
  type RichEmailContent,
  type EmailSection,
} from "./emailTemplate.js";
import { buildClientReportDetail, formatAppreciationStyle } from "./clientReport.js";
import {
  AGENT_ARCHETYPE_DETAILS,
  getCompatibleClientTypes,
  isApprovedAgentArchetype,
  isApprovedClientArchetype,
  normalizeArchetypeName,
} from "./archetypes.js";

/**
 * Content-rich REQUITY email builders (server-side, approved data only).
 *
 * Each builder returns a fully rendered { subject, html, text } (plus optional
 * `meta` used for email_events warnings). The body is USEFUL WITHOUT LOGGING IN:
 * dashboard links are only ever a secondary CTA. All archetype content comes
 * from the canonical approved data in archetypes.ts / clientReport.ts; when an
 * archetype is missing or invalid the builder degrades to a safe, truthful
 * "assessment completed, under review" message and flags a warning in `meta`
 * (never an invented archetype).
 */

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
  /** Optional structured metadata (e.g. archetype validity warnings). */
  meta?: Record<string, unknown>;
};

const EMAIL_SUBJECTS = {
  assessmentCompleted: "New client assessment completed on REQUITY",
  agentAssessmentCompleted: "Your REQUITY agent archetype is ready",
  matchReviewStarted: "Your REQUITY match is being reviewed",
  getToKnowAgent: "Get to know your REQUITY agent",
} as const;

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function firstName(fullName: string | null | undefined): string | null {
  const n = clean(fullName);
  if (!n) return null;
  return n.split(/\s+/)[0] ?? n;
}

/** buying → true for buying/both; selling → true for selling/both. */
function intentApplies(intent: string | null | undefined, side: "buying" | "selling"): boolean {
  const i = (intent ?? "").toLowerCase();
  if (side === "buying") return i === "buying" || i === "both";
  return i === "selling" || i === "both";
}

// ---------------------------------------------------------------------------
// Part 1: Client assessment report emailed to the assigned agent/reviewer.
// ---------------------------------------------------------------------------

export type ClientAssessmentReportInput = {
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  transactionIntent?: string | null;
  transactionIntentLabel?: string | null;
  buyingMarketCity?: string | null;
  sellingMarketCity?: string | null;
  marketCity?: string | null;
  archetype?: string | null;
  appreciationStyle?: string | null;
  expectationsOrQuestions?: string | null;
  assignedAgentName?: string | null;
  /** Agent-facing reviewer notes. Only include when present AND safe to share. */
  reviewerNotes?: string | null;
  /** Secondary CTA target (defaults to the agent dashboard). */
  ctaUrl?: string | null;
};

export function buildClientAssessmentEmailReport(input: ClientAssessmentReportInput): BuiltEmail {
  const clientName = clean(input.clientName) ?? "A client";
  const approved = isApprovedClientArchetype(input.archetype);
  const detail = buildClientReportDetail({
    archetype: input.archetype ?? null,
    transactionIntent: input.transactionIntent ?? null,
    transactionIntentLabel: input.transactionIntentLabel ?? null,
    marketCity: input.marketCity ?? null,
    appreciationStyle: input.appreciationStyle ?? null,
    expectationsOrQuestions: input.expectationsOrQuestions ?? null,
  });

  const intentLabel =
    clean(input.transactionIntentLabel) ??
    (() => {
      const i = (input.transactionIntent ?? "").toLowerCase();
      if (i === "buying") return "Buying";
      if (i === "selling") return "Selling";
      if (i === "both") return "Buying and Selling";
      if (i === "other") return "Other";
      return null;
    })();

  const sections: EmailSection[] = [
    {
      kind: "details",
      rows: [
        { label: "Client", value: clientName },
        { label: "Client email", value: input.clientEmail },
        { label: "Client phone", value: input.clientPhone },
        { label: "Transaction intent", value: intentLabel },
        { label: "Buying market", value: input.buyingMarketCity },
        { label: "Selling market", value: input.sellingMarketCity },
        { label: "General market", value: input.marketCity },
        { label: "Client archetype", value: detail.archetypeDisplayName },
        { label: "Assigned agent", value: input.assignedAgentName },
      ],
    },
  ];

  const ctaUrl = clean(input.ctaUrl) ?? agentDashboardUrl();

  if (!approved || !detail.archetypeDisplayName) {
    // Safe, truthful fallback: no fabricated archetype.
    sections.push({
      kind: "paragraph",
      text: "This client completed the REQUITY assessment. Their relational archetype is being reviewed and will be available shortly. In the meantime you can reach out using the contact details above.",
    });
    const content: RichEmailContent = {
      title: "New client assessment completed",
      preheader: `${clientName} completed the REQUITY assessment.`,
      intro: `${clientName} just completed their REQUITY assessment.`,
      sections,
      ctaLabel: "View in REQUITY",
      ctaUrl,
    };
    return {
      subject: EMAIL_SUBJECTS.assessmentCompleted,
      html: buildRequityReportHtml(content),
      text: buildRequityReportText(content),
      meta: {
        archetypeValid: false,
        archetypeWarning: `Client archetype missing or not approved: ${clean(input.archetype) ?? "none"}`,
      },
    };
  }

  const guidelines = detail.guidelines;
  const communication =
    (guidelines?.communication?.recommended ?? []).length
      ? guidelines!.communication.recommended
      : detail.buyerProfile?.communication ?? [];

  // Best ways to work with this client: blend communication + stress-reduction.
  const bestWays = Array.from(
    new Set([
      ...(detail.buyerProfile?.communication ?? []).slice(0, 2),
      ...(detail.buyerProfile?.stressReduction ?? []).slice(0, 2),
    ])
  ).slice(0, 4);

  sections.push({ kind: "heading", text: "Client archetype summary" });
  sections.push({ kind: "paragraph", text: detail.summary });

  sections.push({ kind: "bullets", heading: "What this client is looking for", items: detail.whatThisClientIsAfter });
  sections.push({ kind: "bullets", heading: "Communication style", items: communication });

  if (intentApplies(input.transactionIntent, "buying")) {
    sections.push({ kind: "bullets", heading: "Buyer guidance", items: guidelines?.buyer?.approaches ?? [] });
  }
  if (intentApplies(input.transactionIntent, "selling")) {
    sections.push({ kind: "bullets", heading: "Seller guidance", items: guidelines?.seller?.approaches ?? [] });
  }

  sections.push({ kind: "bullets", heading: "Best ways to work with this client", items: bestWays });

  // Final assessment questions. Always shown so the agent knows whether the
  // client answered; readable labels only, never snake_case stored values.
  sections.push({ kind: "heading", text: "What this client wants from their agent" });
  sections.push({
    kind: "details",
    rows: [
      {
        label: "How they feel valued",
        value: formatAppreciationStyle(input.appreciationStyle) ?? "Not provided",
      },
    ],
  });
  sections.push({ kind: "paragraph", text: "Expectations, questions, and additional information:" });
  sections.push({
    kind: "paragraph",
    text: clean(input.expectationsOrQuestions) ?? "Not provided",
  });
  if (clean(input.reviewerNotes)) {
    sections.push({ kind: "heading", text: "Reviewer notes" });
    sections.push({ kind: "paragraph", text: input.reviewerNotes });
  }

  const content: RichEmailContent = {
    title: "New client assessment completed",
    preheader: `${clientName} is ${detail.archetypeDisplayName}. See their relational report.`,
    intro: `${clientName} just completed their REQUITY assessment. Here is their relational report so you can prepare before you reach out.`,
    sections,
    ctaLabel: "View in REQUITY",
    ctaUrl,
  };

  return {
    subject: EMAIL_SUBJECTS.assessmentCompleted,
    html: buildRequityReportHtml(content),
    text: buildRequityReportText(content),
    meta: { archetypeValid: true, clientArchetype: detail.archetypeDisplayName },
  };
}

// ---------------------------------------------------------------------------
// Part 2: Agent archetype report emailed to the agent who completed it.
// ---------------------------------------------------------------------------

export type AgentArchetypeReportInput = {
  agentName?: string | null;
  archetype?: string | null;
  marketCity?: string | null;
  ctaUrl?: string | null;
};

const AGENT_ADAPT_GUIDANCE = [
  "Clients whose decision pace differs from yours may need extra check ins",
  "Adjust how much detail you share to match how each client prefers to decide",
  "Slow down for clients who need reassurance before they commit",
];

const AGENT_PRACTICAL_GUIDANCE = [
  "Lead with your strengths above in the first conversation",
  "Confirm each client's preferred communication rhythm early",
  "Summarize the next steps in writing after each conversation",
];

const AGENT_NEXT_STEPS = [
  "Review your matched clients in your REQUITY dashboard",
  "Reach out to new matches within 24 hours",
  "Keep your market and service area up to date so matching stays accurate",
];

export function buildAgentArchetypeEmailReport(input: AgentArchetypeReportInput): BuiltEmail {
  const agentName = clean(input.agentName) ?? "there";
  const approved = isApprovedAgentArchetype(input.archetype);
  const name = approved ? normalizeArchetypeName(input.archetype) : null;
  const details = name ? AGENT_ARCHETYPE_DETAILS[name] ?? null : null;
  const ctaUrl = clean(input.ctaUrl) ?? agentDashboardUrl();

  if (!approved || !name || !details) {
    const sections: EmailSection[] = [
      {
        kind: "paragraph",
        text: "Your REQUITY agent assessment is complete and your archetype is being finalized. You will be able to view the full breakdown in your dashboard shortly.",
      },
    ];
    const content: RichEmailContent = {
      title: "Your REQUITY agent assessment is complete",
      preheader: "Your agent assessment is complete and under review.",
      intro: `Hi ${agentName}, thank you for completing your REQUITY agent assessment.`,
      sections,
      ctaLabel: "View your REQUITY dashboard",
      ctaUrl,
    };
    return {
      subject: EMAIL_SUBJECTS.agentAssessmentCompleted,
      html: buildRequityReportHtml(content),
      text: buildRequityReportText(content),
      meta: {
        archetypeValid: false,
        archetypeWarning: `Agent archetype missing or not approved: ${clean(input.archetype) ?? "none"}`,
      },
    };
  }

  const idealClients = details.idealClients.length ? details.idealClients : getCompatibleClientTypes(name);

  const sections: EmailSection[] = [
    {
      kind: "details",
      rows: [
        { label: "Agent", value: input.agentName },
        { label: "Your archetype", value: name },
        { label: "Market", value: input.marketCity },
      ],
    },
    { kind: "heading", text: "Your archetype summary" },
    { kind: "paragraph", text: details.summary },
    { kind: "heading", text: "Your communication style" },
    { kind: "paragraph", text: details.workingStyle },
    { kind: "bullets", heading: "Your strengths", items: details.strengths },
    { kind: "bullets", heading: "Client types you work well with", items: idealClients },
    { kind: "bullets", heading: "Where you may need to adapt", items: AGENT_ADAPT_GUIDANCE },
    { kind: "bullets", heading: "Practical guidance for working with clients", items: AGENT_PRACTICAL_GUIDANCE },
    { kind: "bullets", heading: "Recommended next steps", items: AGENT_NEXT_STEPS },
  ];

  const content: RichEmailContent = {
    title: "Your REQUITY agent archetype is ready",
    preheader: `You are ${name}. Here is what that means for how you work.`,
    intro: `Hi ${agentName}, your assessment is complete. Your REQUITY agent archetype is ${name}. Here is your full breakdown.`,
    sections,
    ctaLabel: "View your REQUITY dashboard",
    ctaUrl,
  };

  return {
    subject: EMAIL_SUBJECTS.agentAssessmentCompleted,
    html: buildRequityReportHtml(content),
    text: buildRequityReportText(content),
    meta: { archetypeValid: true, agentArchetype: name },
  };
}

// ---------------------------------------------------------------------------
// Part 3: Client-facing "your match is being reviewed" email.
// ---------------------------------------------------------------------------

export type ClientMatchReviewStartedInput = {
  clientName?: string | null;
};

export function buildClientMatchReviewStartedEmail(input: ClientMatchReviewStartedInput): BuiltEmail {
  const name = firstName(input.clientName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const sections: EmailSection[] = [
    { kind: "paragraph", text: "Your assessment has been received. Thank you for completing it." },
    { kind: "paragraph", text: "REQUITY is now reviewing your profile to identify an agent whose working style is compatible with your needs." },
    { kind: "paragraph", text: "You will receive another email when your agent match is ready." },
  ];

  const content: RichEmailContent = {
    title: "Your REQUITY match is being reviewed",
    preheader: "We received your assessment and are finding your agent match.",
    intro: greeting,
    sections,
    footerNote: "No login is required. We will email you the next step.",
  };

  return {
    subject: EMAIL_SUBJECTS.matchReviewStarted,
    html: buildRequityReportHtml(content),
    text: buildRequityReportText(content),
    meta: { clientFacing: true },
  };
}

// ---------------------------------------------------------------------------
// Part 4: Client-facing "get to know your agent" email (match finalized).
// ---------------------------------------------------------------------------

export type GetToKnowAgentInput = {
  clientName?: string | null;
  agentName?: string | null;
  agentEmail?: string | null;
  /** Only shown when explicitly approved for public display. */
  agentPhone?: string | null;
  agentPhonePublic?: boolean;
  agentMarket?: string | null;
  agentArchetype?: string | null;
};

const GET_TO_KNOW_FIRST_QUESTIONS = [
  "What does the process look like from here?",
  "How and how often will we communicate?",
  "What should I prepare before we get started?",
];

export function buildGetToKnowAgentEmail(input: GetToKnowAgentInput): BuiltEmail {
  const clientFirst = firstName(input.clientName);
  const greeting = clientFirst ? `Hi ${clientFirst},` : "Hi,";
  const agentName = clean(input.agentName);
  const approved = isApprovedAgentArchetype(input.agentArchetype);
  const name = approved ? normalizeArchetypeName(input.agentArchetype) : null;
  const details = name ? AGENT_ARCHETYPE_DETAILS[name] ?? null : null;

  // Contact block: email is the intended contact channel. Phone only when the
  // agent has explicitly approved sharing it publicly.
  const showPhone = input.agentPhonePublic === true;
  const contactRows: EmailSection = {
    kind: "details",
    rows: [
      { label: "Email", value: input.agentEmail },
      { label: "Phone", value: showPhone ? input.agentPhone : null },
    ],
  };

  const sections: EmailSection[] = [
    {
      kind: "details",
      rows: [
        { label: "Agent", value: agentName },
        { label: "Agent archetype", value: name },
        { label: "Market", value: input.agentMarket },
      ],
    },
  ];

  if (details) {
    sections.push({ kind: "heading", text: "Quick summary" });
    sections.push({ kind: "paragraph", text: details.summary });
    sections.push({ kind: "heading", text: "What this means for you" });
    sections.push({
      kind: "paragraph",
      text: `Your agent's working style is ${lowerFirst(details.workingStyle)} Expect communication and guidance suited to how you like to make decisions during your buying or selling journey.`,
    });
    sections.push({ kind: "bullets", heading: "Why this agent may be a good fit", items: details.strengths });
  } else {
    sections.push({
      kind: "paragraph",
      text: "Your agent will share more about how they work when you connect. You can reach out using the contact details below.",
    });
  }

  sections.push({ kind: "bullets", heading: "Good first questions to ask", items: GET_TO_KNOW_FIRST_QUESTIONS });
  sections.push({ kind: "heading", text: "Contact" });
  sections.push(contactRows);

  const content: RichEmailContent = {
    title: "Get to know your REQUITY agent",
    preheader: agentName ? `You have been matched with ${agentName}.` : "You have been matched with an agent.",
    intro: `${greeting} We reviewed your assessment and matched you with an agent whose working style aligns with your needs.`,
    sections,
    footerNote: "No login is required. Reply to your agent directly to get started.",
  };

  return {
    subject: EMAIL_SUBJECTS.getToKnowAgent,
    html: buildRequityReportHtml(content),
    text: buildRequityReportText(content),
    meta: {
      clientFacing: true,
      archetypeValid: Boolean(details),
      ...(details ? { agentArchetype: name } : { archetypeWarning: `Agent archetype missing or not approved: ${clean(input.agentArchetype) ?? "none"}` }),
    },
  };
}

/** Lowercase the first character so the summary reads naturally mid sentence. */
function lowerFirst(value: string): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  const out = s.charAt(0).toLowerCase() + s.slice(1);
  return /[.!?]$/.test(out) ? out : `${out}.`;
}
