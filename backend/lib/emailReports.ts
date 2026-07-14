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
  finalMatchBuying: "Your REQUITY buying agent match is ready",
  finalMatchSelling: "Your REQUITY selling agent match is ready",
  finalMatchTwoAgents: "Your REQUITY real estate agent matches are ready",
  finalMatchOneAgent: "Your REQUITY real estate agent match is ready",
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
        value: formatAppreciationStyle(input.appreciationStyle) ?? "Not answered",
      },
    ],
  });
  sections.push({ kind: "paragraph", text: "Expectations, questions, and additional information:" });
  sections.push({
    kind: "paragraph",
    text: clean(input.expectationsOrQuestions) ?? "Not answered",
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

  // Client-facing: internal archetype labels are NEVER shown here. The
  // archetype only drives the plain-language strengths below.
  const sections: EmailSection[] = [
    {
      kind: "details",
      rows: [
        { label: "Agent", value: agentName },
        { label: "Market", value: input.agentMarket },
      ],
    },
  ];

  if (details) {
    sections.push({ kind: "heading", text: "What this means for you" });
    sections.push({
      kind: "paragraph",
      text: `Your agent's working style is ${lowerFirst(details.workingStyle)} Expect communication and guidance suited to how you like to make decisions during your buying or selling journey.`,
    });
    sections.push({ kind: "bullets", heading: "This agent\u2019s strengths are", items: details.strengths });
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

// ---------------------------------------------------------------------------
// Part 5: Client-facing FINAL match email (one email per completed match).
// ---------------------------------------------------------------------------

/**
 * Plain-language agent strengths shown to clients. Internal archetype labels
 * are NEVER exposed in this email; when the agent has an approved archetype we
 * reuse its (already plain-language) strengths and pad with these to reach at
 * least three bullets.
 */
const GENERIC_AGENT_STRENGTHS = [
  "Communicates clearly and consistently",
  "Offers a practical, organized approach",
  "Has experience supporting clients in your market",
  "Provides the level of guidance you requested",
  "Keeps important decisions and next steps clear",
];

/** 3 to 5 plain-language strengths (no archetype names, no internal labels). */
function clientFacingStrengths(agentArchetype: string | null | undefined): string[] {
  const approved = isApprovedAgentArchetype(agentArchetype);
  const name = approved ? normalizeArchetypeName(agentArchetype) : null;
  const details = name ? AGENT_ARCHETYPE_DETAILS[name] ?? null : null;
  const out = [...(details?.strengths ?? [])];
  for (const s of GENERIC_AGENT_STRENGTHS) {
    if (out.length >= 3) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 5);
}

/** Normalize a phone into a safe tel: href (US default), or null when absent. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = clean(phone);
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${digits}`;
}

function mailtoHref(email: string | null | undefined): string | null {
  const raw = clean(email);
  return raw ? `mailto:${raw}` : null;
}

export type FinalMatchAgentInput = {
  agentName?: string | null;
  agentEmail?: string | null;
  /** Normalized single phone value (see normalizeAgentPhone). */
  agentPhone?: string | null;
  /** Internal only: used to derive plain-language strengths, never shown. */
  agentArchetype?: string | null;
};

export type ClientFinalMatchEmailInput = {
  clientName?: string | null;
  /** Agent for the buying side (two-agent or buying-only completions). */
  buyingAgent?: FinalMatchAgentInput | null;
  /** Agent for the selling side (two-agent or selling-only completions). */
  sellingAgent?: FinalMatchAgentInput | null;
  /** One agent covering both sides ("both" lane). */
  bothAgent?: FinalMatchAgentInput | null;
  /** Legacy/general single match. */
  generalAgent?: FinalMatchAgentInput | null;
  buyingMarket?: string | null;
  sellingMarket?: string | null;
  generalMarket?: string | null;
};

type FinalMatchType = "buying" | "selling" | "both_two_agents" | "both_one_agent" | "general";

/** Contact rows for one agent. Email/phone always render ("Not provided" fallback). */
function agentContactRows(
  agent: FinalMatchAgentInput,
  labels: { name: string; email: string; phone: string }
): EmailSection {
  const email = clean(agent.agentEmail);
  const phone = clean(agent.agentPhone);
  return {
    kind: "details",
    rows: [
      { label: labels.name, value: clean(agent.agentName) ?? "Your REQUITY agent" },
      { label: labels.email, value: email ?? "Not provided", href: mailtoHref(email) },
      { label: labels.phone, value: phone ?? "Not provided", href: telHref(phone) },
    ],
  };
}

const WHAT_HAPPENS_NEXT_COPY =
  "Your agent or agents now have the assessment information needed to understand your preferences. You can contact them directly using the information above, and they may also contact you to begin the conversation.";

/**
 * The ONE client-facing final match email, sent only when the client's full
 * match is complete (both lanes for buying-and-selling clients). Speaks
 * directly to the client, never exposes archetype or fit labels, and always
 * includes each agent's email and phone (with "Not provided" fallbacks).
 */
export function buildClientFinalMatchEmail(input: ClientFinalMatchEmailInput): BuiltEmail {
  const clientFirst = firstName(input.clientName);
  const greeting = clientFirst ? `Hi ${clientFirst},` : "Hi,";

  // Two-agent inputs where both lanes resolved to the SAME agent collapse to
  // the one-agent presentation so the client never sees a duplicated agent.
  let buying = input.buyingAgent ?? null;
  let selling = input.sellingAgent ?? null;
  let single = input.bothAgent ?? input.generalAgent ?? null;
  if (buying && selling) {
    const be = clean(buying.agentEmail)?.toLowerCase();
    const se = clean(selling.agentEmail)?.toLowerCase();
    if (be && se && be === se) {
      single = buying;
      buying = null;
      selling = null;
    }
  }

  let matchType: FinalMatchType;
  if (buying && selling) matchType = "both_two_agents";
  else if (input.bothAgent && single) matchType = "both_one_agent";
  else if (buying) matchType = "buying";
  else if (selling) matchType = "selling";
  else matchType = "general";

  const subject =
    matchType === "buying"
      ? EMAIL_SUBJECTS.finalMatchBuying
      : matchType === "selling"
        ? EMAIL_SUBJECTS.finalMatchSelling
        : matchType === "both_two_agents"
          ? EMAIL_SUBJECTS.finalMatchTwoAgents
          : EMAIL_SUBJECTS.finalMatchOneAgent;

  const sections: EmailSection[] = [];

  // "Your match at a glance" (client-direct, adapted to the match type).
  sections.push({ kind: "heading", text: "Your match at a glance" });
  const agentWord = matchType === "both_two_agents" ? "agents" : "agent";
  sections.push({
    kind: "paragraph",
    text: `REQUITY has completed its review and selected the ${agentWord} below based on your market, communication preferences, and the type of guidance you told us you want.`,
  });

  if (matchType === "buying" && buying) {
    sections.push({
      kind: "details",
      rows: [
        { label: "Your buying agent", value: clean(buying.agentName) ?? "Not provided" },
        { label: "Buying market", value: clean(input.buyingMarket) ?? "Not provided" },
      ],
    });
  } else if (matchType === "selling" && selling) {
    sections.push({
      kind: "details",
      rows: [
        { label: "Your selling agent", value: clean(selling.agentName) ?? "Not provided" },
        { label: "Selling market", value: clean(input.sellingMarket) ?? "Not provided" },
      ],
    });
  } else if (matchType === "both_two_agents" && buying && selling) {
    sections.push({
      kind: "details",
      rows: [
        { label: "Your buying agent", value: clean(buying.agentName) ?? "Not provided" },
        { label: "Buying market", value: clean(input.buyingMarket) ?? "Not provided" },
        { label: "Your selling agent", value: clean(selling.agentName) ?? "Not provided" },
        { label: "Selling market", value: clean(input.sellingMarket) ?? "Not provided" },
      ],
    });
  } else if (single) {
    const rows = [
      { label: "Your real estate agent", value: clean(single.agentName) ?? "Not provided" },
    ] as { label: string; value: string }[];
    if (matchType === "both_one_agent" || (clean(input.buyingMarket) && clean(input.sellingMarket))) {
      rows.push({ label: "Buying market", value: clean(input.buyingMarket) ?? "Not provided" });
      rows.push({ label: "Selling market", value: clean(input.sellingMarket) ?? "Not provided" });
    } else {
      const market =
        clean(input.generalMarket) ?? clean(input.buyingMarket) ?? clean(input.sellingMarket);
      if (market) rows.push({ label: "Market", value: market });
    }
    sections.push({ kind: "details", rows });
  }

  // Per-agent contact details (Name, Email, Phone; clickable in HTML).
  if (buying) {
    sections.push({ kind: "heading", text: "Buying agent" });
    sections.push(
      agentContactRows(buying, { name: "Name", email: "Email", phone: "Phone" })
    );
  }
  if (selling) {
    sections.push({ kind: "heading", text: "Selling agent" });
    sections.push(
      agentContactRows(selling, { name: "Name", email: "Email", phone: "Phone" })
    );
  }
  if (!buying && !selling && single) {
    sections.push({ kind: "heading", text: "Your agent" });
    sections.push(
      agentContactRows(single, { name: "Name", email: "Email", phone: "Phone" })
    );
  }

  // Strengths: plain language only, never internal archetype/fit labels.
  if (matchType === "both_two_agents" && buying && selling) {
    sections.push({
      kind: "bullets",
      heading: "Your buying agent\u2019s strengths are",
      items: clientFacingStrengths(buying.agentArchetype),
    });
    sections.push({
      kind: "bullets",
      heading: "Your selling agent\u2019s strengths are",
      items: clientFacingStrengths(selling.agentArchetype),
    });
  } else {
    const one = buying ?? selling ?? single;
    if (one) {
      sections.push({
        kind: "bullets",
        heading: "This agent\u2019s strengths are",
        items: clientFacingStrengths(one.agentArchetype),
      });
    }
  }

  sections.push({ kind: "heading", text: "What happens next" });
  sections.push({ kind: "paragraph", text: WHAT_HAPPENS_NEXT_COPY });

  const title =
    matchType === "both_two_agents"
      ? "Your agent matches are ready"
      : "Your agent match is ready";

  const content: RichEmailContent = {
    title,
    preheader:
      matchType === "both_two_agents"
        ? "Your REQUITY buying and selling agent matches are complete."
        : "Your REQUITY agent match is complete.",
    intro: `${greeting} Your REQUITY match is complete.`,
    sections,
    footerNote: "No login is required. You can reach out to your agent directly to get started.",
  };

  return {
    subject,
    html: buildRequityReportHtml(content),
    text: buildRequityReportText(content),
    meta: { clientFacing: true, matchType, eventType: "client_match_complete" },
  };
}
