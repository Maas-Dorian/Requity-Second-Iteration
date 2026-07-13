import { getOptionalEnv, env } from "./env.js";
import { sendSendGridEmail } from "./sendgrid.js";
import { sendBrevoEmail } from "./brevo.js";
import {
  recordEmailEvent,
  emailEventAlreadySent,
  type EmailEventStatus,
} from "./emailEvents.js";
import {
  buildRequityEmailHtml,
  buildPlainTextEmail,
  buildRequityReportHtml,
  buildRequityReportText,
  agentDashboardUrl,
  reviewerDashboardUrl,
  type EmailContentInput,
  type EmailSection,
  type RichEmailContent,
} from "./emailTemplate.js";
import { formatAppreciationStyle } from "./clientReport.js";
import {
  buildClientAssessmentEmailReport,
  buildAgentArchetypeEmailReport,
  buildClientMatchReviewStartedEmail,
  buildGetToKnowAgentEmail,
  type BuiltEmail,
} from "./emailReports.js";

/**
 * High-level REQUITY email orchestration (server-side ONLY).
 *
 * This module owns *what* to send and *to whom*, plus idempotency/dedupe and
 * audit recording. The actual transport is provider based:
 *   - EMAIL_PROVIDER=sendgrid (or unset) uses backend/lib/sendgrid.ts.
 *   - EMAIL_PROVIDER=brevo (only when explicitly configured later) uses brevo.ts.
 * Nothing in this file is import-safe for the browser; it reads server env and
 * the provider API key.
 *
 * Content-rich emails (assessment reports, agent archetype, get-to-know-agent)
 * are composed by backend/lib/emailReports.ts so the body is useful WITHOUT
 * logging in; dashboard links are only ever a secondary CTA.
 *
 * Guarantees:
 *   - Never throws to the caller; always returns a structured delivery result so
 *     a failed email can never break assessment submission or match assignment.
 *   - Never exposes the SendGrid/Brevo API key or env values.
 *   - Dedupes via email_events.event_key when an eventKey is provided.
 *   - Never marks an event "sent" unless the provider returned 2xx.
 */

// Re-exported so callers have a single email surface (Part 2 deliverable).
export { recordEmailEvent } from "./emailEvents.js";

// Re-export the templating + link primitives so `email.js` stays the one import
// surface for existing callers (test-email endpoint, index barrel, etc.).
export {
  escapeHtml,
  buildRequityEmailHtml,
  buildPlainTextEmail,
  buildRequityReportHtml,
  buildRequityReportText,
  getPublicSiteUrl,
  agentDashboardUrl,
  reviewerDashboardUrl,
  type EmailDetail,
  type EmailContentInput,
  type EmailSection,
  type RichEmailContent,
} from "./emailTemplate.js";

// Re-export the content-rich builders so they are reachable from the barrel.
export {
  buildClientAssessmentEmailReport,
  buildAgentArchetypeEmailReport,
  buildClientMatchReviewStartedEmail,
  buildGetToKnowAgentEmail,
  type BuiltEmail,
} from "./emailReports.js";

export type EmailDeliveryStatus = "sent" | "skipped" | "failed";

export type EmailProvider = "sendgrid" | "brevo";

/**
 * Resolve the active email provider. SendGrid is the default and is used when
 * EMAIL_PROVIDER is unset. Brevo is only used when explicitly configured.
 */
export function resolveEmailProvider(): EmailProvider {
  const configured = (getOptionalEnv("EMAIL_PROVIDER") ?? "").trim().toLowerCase();
  return configured === "brevo" ? "brevo" : "sendgrid";
}

export type EmailDeliveryResult = {
  /** True only when at least one recipient was actually sent to. */
  emailed: boolean;
  emailStatus: EmailDeliveryStatus;
  /** Recipient emails that were targeted (for logs; safe to surface internally). */
  recipients: string[];
  /** Why the send was skipped/failed (safe text, never secrets). */
  reason?: string;
};

export type EmailRole = "agent" | "reviewer" | "admin" | "client";
export type EmailTarget = { email: string; name?: string | null; role?: EmailRole };

/** Reviewer/admin recipients get the reviewer dashboard; everyone else the agent one. */
function dashboardUrlForRole(role?: EmailRole): string {
  return role === "reviewer" || role === "admin" ? reviewerDashboardUrl() : agentDashboardUrl();
}

/** Drop blanks and de-duplicate recipients by lowercased email. */
function normalizeTargets(targets: EmailTarget[]): EmailTarget[] {
  const seen = new Set<string>();
  const out: EmailTarget[] = [];
  for (const t of targets) {
    const email = (t?.email ?? "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email, name: t.name ?? null, role: t.role });
  }
  return out;
}

/**
 * Safe structured email logging for Vercel. Never logs the provider API key,
 * sender values, or full HTML payloads; only provider, event type, status,
 * http status, message-id presence and short error text.
 */
function logEmail(
  tag:
    | "EMAIL_CONFIG_CHECK"
    | "EMAIL_SEND_ATTEMPT"
    | "EMAIL_SEND_RESULT"
    | "EMAIL_SEND_FAILED"
    | "EMAIL_RATE_LIMITED"
    | "EMAIL_ARCHETYPE_WARNING",
  fields: Record<string, unknown>
): void {
  try {
    console.log(tag, JSON.stringify(fields));
  } catch {
    console.log(tag, fields);
  }
}

/** Truncate an error message to a short, safe length for logs (never secrets). */
function safeShortError(message: string | null | undefined): string {
  const text = (message ?? "").toString().trim();
  if (!text) return "send_error";
  return text.slice(0, 200);
}

/** Aggregate per-recipient results into the coarse delivery status. */
function aggregateDeliveryStatus(results: SendAppEmailResult[]): EmailDeliveryStatus {
  if (results.some((r) => r.status === "sent")) return "sent";
  if (results.length && results.every((r) => r.status === "deduped" || r.status === "skipped"))
    return "skipped";
  return "failed";
}

/** Map a single send result to the coarse per-caller delivery result. */
function toDeliveryResult(res: SendAppEmailResult): EmailDeliveryResult {
  const emailStatus: EmailDeliveryStatus =
    res.status === "sent"
      ? "sent"
      : res.status === "deduped" || res.status === "skipped"
      ? "skipped"
      : "failed";
  return {
    emailed: res.emailed,
    emailStatus,
    recipients: res.recipient ? [res.recipient] : [],
    reason: res.errorMessage ?? undefined,
  };
}

/** REQUITY email subjects (no cross dashes). */
export const EMAIL_SUBJECTS = {
  assessmentCompleted: "New client assessment completed on REQUITY",
  clientMatched: "New REQUITY client match",
  agentAssessmentCompleted: "Your REQUITY agent archetype is ready",
  matchReviewStarted: "Your REQUITY match is being reviewed",
  getToKnowAgent: "Get to know your REQUITY agent",
  testEmail: "REQUITY SendGrid test email",
  reviewerAssessmentSubmitted: "New REQUITY assessment submitted",
  reviewerMatchReviewStarted: "Match review started on REQUITY",
  reviewerMatchFinalized: "REQUITY match finalized",
  reviewerMatchReplaced: "REQUITY match replaced",
  passwordReset: "Reset your REQUITY password",
} as const;

// --- Unified provider-based send (Part 2 deliverable) ----------------------

export type SendAppEmailParams = {
  /** Coarse event type, e.g. "assessment_completed". Also used as a tag. */
  eventType: string;
  /** Idempotency key for dedupe (e.g. "assessment_completed:<id>"). */
  eventKey?: string | null;
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type SendAppEmailResult = {
  /** True only when the active provider accepted the email (2xx). */
  emailed: boolean;
  provider: EmailProvider;
  status: EmailEventStatus;
  messageId: string | null;
  httpStatus: number | null;
  errorMessage: string | null;
  recipient: string;
};

/**
 * The single email surface every REQUITY trigger uses. Resolves the active
 * provider (SendGrid by default), dedupes by eventKey, sends, and records a
 * truthful email_events row. Never throws.
 */
export async function sendAppEmail(params: SendAppEmailParams): Promise<SendAppEmailResult> {
  const provider = resolveEmailProvider();
  const recipient = (params.to ?? "").trim();
  const tags = Array.from(new Set([params.eventType, ...(params.tags ?? [])].filter(Boolean)));

  logEmail("EMAIL_SEND_ATTEMPT", {
    provider,
    eventType: params.eventType,
    status: "sending",
    hasRecipient: recipient.length > 0,
  });

  // Surface a clear (non-blocking) warning when the content builder flagged an
  // invalid/missing archetype, so reviewers/admins can follow up.
  if (params.metadata && params.metadata["archetypeValid"] === false) {
    logEmail("EMAIL_ARCHETYPE_WARNING", {
      provider,
      eventType: params.eventType,
      message: safeShortError(String(params.metadata["archetypeWarning"] ?? "invalid archetype")),
    });
  }

  // No recipient: record a truthful "skipped", never pretend it sent.
  if (!recipient) {
    await recordEmailEvent({
      recipientEmail: "(none)",
      templateKey: params.eventType,
      eventType: params.eventType,
      provider,
      status: "skipped",
      errorMessage: "No recipient found",
      eventKey: null,
      payload: { ...(params.metadata ?? {}), reason: "No recipient found" },
    });
    logEmail("EMAIL_SEND_RESULT", { provider, eventType: params.eventType, status: "skipped" });
    return {
      emailed: false,
      provider,
      status: "skipped",
      messageId: null,
      httpStatus: null,
      errorMessage: "No recipient found",
      recipient: "",
    };
  }

  // Dedupe: an already-sent event returns "deduped" (not a fake send).
  if (params.eventKey && (await emailEventAlreadySent(params.eventKey))) {
    await recordEmailEvent({
      recipientEmail: recipient,
      templateKey: params.eventType,
      eventType: params.eventType,
      provider,
      status: "deduped",
      eventKey: null,
      payload: { ...(params.metadata ?? {}), reason: "Already sent (duplicate event)" },
    });
    logEmail("EMAIL_SEND_RESULT", { provider, eventType: params.eventType, status: "deduped" });
    return {
      emailed: false,
      provider,
      status: "deduped",
      messageId: null,
      httpStatus: null,
      errorMessage: null,
      recipient,
    };
  }

  // Send via the active provider.
  let sent = false;
  let httpStatus: number | null = null;
  let messageId: string | null = null;
  let rateLimited = false;
  let errorMessage: string | null = null;

  if (provider === "brevo") {
    const r = await sendBrevoEmail({
      to: [{ email: recipient, name: params.toName ?? undefined }],
      subject: params.subject,
      htmlContent: params.html,
      textContent: params.text,
      tags,
    });
    sent = r.sent;
    httpStatus = r.httpStatus ?? null;
    messageId = r.providerMessageId ?? null;
    rateLimited = r.httpStatus === 429;
    errorMessage = r.sent ? null : r.error ?? null;
  } else {
    const r = await sendSendGridEmail({
      to: recipient,
      toName: params.toName ?? null,
      subject: params.subject,
      html: params.html,
      text: params.text,
      categories: tags,
    });
    sent = r.sent;
    httpStatus = r.httpStatus;
    messageId = r.providerMessageId;
    rateLimited = r.rateLimited;
    errorMessage = r.errorMessage;
  }

  const status: EmailEventStatus = sent ? "sent" : rateLimited ? "rate_limited" : "failed";

  await recordEmailEvent({
    recipientEmail: recipient,
    templateKey: params.eventType,
    eventType: params.eventType,
    provider,
    status,
    providerMessageId: messageId,
    // Only persist the dedupe key on success so failures/rate-limits can retry.
    eventKey: sent ? params.eventKey ?? null : null,
    errorMessage: sent ? null : safeShortError(errorMessage),
    payload: { ...(params.metadata ?? {}), httpStatus, provider },
  });

  logEmail("EMAIL_SEND_RESULT", {
    provider,
    eventType: params.eventType,
    status,
    httpStatus,
    hasMessageId: Boolean(messageId),
  });
  if (!sent) {
    logEmail(rateLimited ? "EMAIL_RATE_LIMITED" : "EMAIL_SEND_FAILED", {
      provider,
      eventType: params.eventType,
      status,
      httpStatus,
      message: safeShortError(errorMessage),
    });
  }

  return {
    emailed: sent,
    provider,
    status,
    messageId,
    httpStatus,
    errorMessage: sent ? null : safeShortError(errorMessage),
    recipient,
  };
}

/**
 * Send a fully built ({subject, html, text}) email to one or more recipients
 * through {@link sendAppEmail}. Each recipient gets a per-recipient dedupe key
 * derived from the base event key, so a retry never double-sends but every
 * distinct recipient is notified.
 */
async function sendBuiltToRecipients(opts: {
  eventType: string;
  baseEventKey?: string | null;
  recipients: EmailTarget[];
  build: (r: EmailTarget) => BuiltEmail;
  metadata?: Record<string, unknown>;
}): Promise<EmailDeliveryResult> {
  const provider = resolveEmailProvider();
  const recipients = normalizeTargets(opts.recipients);

  if (!recipients.length) {
    await recordEmailEvent({
      recipientEmail: "(none)",
      templateKey: opts.eventType,
      eventType: opts.eventType,
      provider,
      status: "skipped",
      errorMessage: "No recipient found",
      eventKey: null,
      payload: { ...(opts.metadata ?? {}), reason: "No recipient found" },
    });
    logEmail("EMAIL_SEND_RESULT", { provider, eventType: opts.eventType, status: "skipped" });
    return { emailed: false, emailStatus: "skipped", recipients: [], reason: "No recipient found" };
  }

  const results: SendAppEmailResult[] = [];
  for (const r of recipients) {
    const built = opts.build(r);
    const res = await sendAppEmail({
      eventType: opts.eventType,
      eventKey: opts.baseEventKey ? `${opts.baseEventKey}:${r.email.toLowerCase()}` : null,
      to: r.email,
      toName: r.name ?? null,
      subject: built.subject,
      html: built.html,
      text: built.text,
      tags: [opts.eventType],
      metadata: { ...(opts.metadata ?? {}), ...(built.meta ?? {}) },
    });
    results.push(res);
  }

  const emailStatus = aggregateDeliveryStatus(results);
  const emailed = results.some((r) => r.emailed);
  return {
    emailed,
    emailStatus,
    recipients: recipients.map((r) => r.email),
    reason: emailed ? undefined : results.find((r) => r.errorMessage)?.errorMessage ?? undefined,
  };
}

/** Wrap the simple single-CTA content model into a {@link BuiltEmail}. */
function builtFromContent(subject: string, content: EmailContentInput): BuiltEmail {
  return {
    subject,
    html: buildRequityEmailHtml(content),
    text: buildPlainTextEmail(content),
  };
}

// ---------------------------------------------------------------------------
// Part 1: assessment_completed -> assigned agent (content-rich report).
// ---------------------------------------------------------------------------

export type ClientCompletedEmailInput = {
  /** Idempotency key, e.g. `assessment_completed:<assessmentId>`. */
  eventKey?: string | null;
  recipients: EmailTarget[];
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  transactionIntent?: string | null;
  transactionIntentLabel?: string | null;
  buyingMarketCity?: string | null;
  sellingMarketCity?: string | null;
  marketCity?: string | null;
  clientArchetype?: string | null;
  appreciationStyle?: string | null;
  expectationsOrQuestions?: string | null;
  assignedAgentName?: string | null;
  /** Agent-facing reviewer notes. Only pass when present AND safe to share. */
  reviewerNotes?: string | null;
};

/**
 * Email the assigned agent (or reviewer/admin fallback) the full client
 * assessment report (event type "assessment_completed"). The body contains the
 * assessment itself, not just a link; the dashboard link is a secondary CTA.
 */
export async function sendClientAssessmentCompletedEmail(
  input: ClientCompletedEmailInput
): Promise<EmailDeliveryResult> {
  return sendBuiltToRecipients({
    eventType: "assessment_completed",
    baseEventKey: input.eventKey ?? null,
    recipients: input.recipients,
    metadata: {
      clientName: input.clientName ?? null,
      transaction: input.transactionIntentLabel ?? input.transactionIntent ?? null,
      market: input.marketCity ?? null,
    },
    build: (r) =>
      buildClientAssessmentEmailReport({
        clientName: input.clientName ?? null,
        clientEmail: input.clientEmail ?? null,
        clientPhone: input.clientPhone ?? null,
        transactionIntent: input.transactionIntent ?? null,
        transactionIntentLabel: input.transactionIntentLabel ?? null,
        buyingMarketCity: input.buyingMarketCity ?? null,
        sellingMarketCity: input.sellingMarketCity ?? null,
        marketCity: input.marketCity ?? null,
        archetype: input.clientArchetype ?? null,
        appreciationStyle: input.appreciationStyle ?? null,
        expectationsOrQuestions: input.expectationsOrQuestions ?? null,
        assignedAgentName: input.assignedAgentName ?? null,
        reviewerNotes: input.reviewerNotes ?? null,
        ctaUrl: dashboardUrlForRole(r.role),
      }),
  });
}

// ---------------------------------------------------------------------------
// client_matched -> agent/reviewer notification (kept; secondary to the
// client-facing get-to-know-agent email).
// ---------------------------------------------------------------------------

/**
 * Lane-aware subject for the agent match email. The lane is ALWAYS explicit in
 * the subject so a buying agent and a selling agent for the same client can
 * never confuse their emails. The general lane keeps the neutral subject.
 */
export function matchLaneEmailSubject(lane: string | null | undefined): string {
  const v = (lane ?? "").toString().toLowerCase();
  if (v === "buying") return "New REQUITY buying client match";
  if (v === "selling") return "New REQUITY selling client match";
  if (v === "both") return "New REQUITY buying and selling client match";
  return EMAIL_SUBJECTS.clientMatched;
}

/** Reviewer/agent-facing label for a match lane (email copy). */
export function matchLaneEmailLabel(lane: string | null | undefined): string {
  const v = (lane ?? "").toString().toLowerCase();
  if (v === "buying") return "Buying";
  if (v === "selling") return "Selling";
  if (v === "both") return "Buying and Selling";
  return "General";
}

export type ClientMatchedEmailInput = {
  /** Idempotency key, e.g. `agent_match_notification:<clientId>:<agentId>:<lane>`. */
  eventKey?: string | null;
  recipients: EmailTarget[];
  clientName?: string | null;
  clientArchetype?: string | null;
  agentName?: string | null;
  matchLabel?: string | null;
  transactionIntentLabel?: string | null;
  marketCity?: string | null;
  /** The lane this match covers: buying | selling | both | general. */
  matchLane?: string | null;
  /** Lane-relevant market copy (buying market for buying lane, etc). */
  laneMarketSummary?: string | null;
  /** Final assessment answers: how the client feels valued (stored value). */
  appreciationStyle?: string | null;
  /** Final assessment answers: open-ended expectations text. */
  agentExpectationsNotes?: string | null;
  /** Event metadata for the email audit trail. */
  clientId?: string | null;
  agentId?: string | null;
  matchId?: string | null;
};

/**
 * Email the matched agent (and optional reviewer/admin) that a REQUITY match is
 * ready to review (event type "client_matched"). The subject AND body carry the
 * match lane so buying and selling agents for the same client receive clearly
 * different, lane-specific emails. Dedupes per client + agent + lane + recipient.
 */
export async function sendClientMatchedEmail(
  input: ClientMatchedEmailInput
): Promise<EmailDeliveryResult> {
  const lane = (input.matchLane ?? "").toString().toLowerCase() || null;
  const laneLabel = matchLaneEmailLabel(lane);
  const subject = matchLaneEmailSubject(lane);
  return sendBuiltToRecipients({
    eventType: "client_matched",
    baseEventKey: input.eventKey ?? null,
    recipients: input.recipients,
    metadata: {
      clientId: input.clientId ?? null,
      agentId: input.agentId ?? null,
      matchId: input.matchId ?? null,
      lane: lane ?? "general",
      eventType: "client_matched",
      clientName: input.clientName ?? null,
      agentName: input.agentName ?? null,
      matchLabel: input.matchLabel ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
    },
    build: (r) => {
      const sections: EmailSection[] = [
        {
          kind: "details",
          rows: [
            { label: "Match lane", value: laneLabel },
            { label: "Client", value: input.clientName },
            { label: "Client archetype", value: input.clientArchetype },
            { label: "Agent", value: input.agentName },
            { label: "Match", value: input.matchLabel },
            { label: "Transaction", value: input.transactionIntentLabel },
            { label: "Market", value: input.laneMarketSummary ?? input.marketCity },
          ],
        },
        // Final assessment answers. Always shown (with a truthful "Not
        // provided" fallback) so the agent knows how this client wants to
        // work with them before the first conversation. Readable labels only.
        { kind: "heading", text: "What this client wants from their agent" },
        {
          kind: "details",
          rows: [
            {
              label: "How they feel valued",
              value: formatAppreciationStyle(input.appreciationStyle) ?? "Not provided",
            },
          ],
        },
        { kind: "paragraph", text: "Expectations, questions, and additional information:" },
        {
          kind: "paragraph",
          text: (input.agentExpectationsNotes ?? "").trim() || "Not provided",
        },
      ];
      const content: RichEmailContent = {
        title:
          lane && lane !== "general"
            ? `A new REQUITY ${laneLabel.toLowerCase()} match is ready`
            : "A new REQUITY match is ready",
        intro: `${
          input.clientName || "A client"
        } has been matched and is ready for your review. Open your dashboard to see the match details.`,
        sections,
        ctaLabel: "View match in REQUITY",
        ctaUrl: dashboardUrlForRole(r.role),
      };
      return {
        subject,
        html: buildRequityReportHtml(content),
        text: buildRequityReportText(content),
      };
    },
  });
}

export type PreviousAgentMatchEndedEmailInput = {
  eventKey?: string | null;
  agentEmail?: string | null;
  agentName?: string | null;
  clientName?: string | null;
  matchLane?: string | null;
  clientId?: string | null;
  agentId?: string | null;
};

/**
 * Optional courtesy email to the PREVIOUS agent when a reviewer replaces their
 * match (event type "match_superseded_agent"). Sent only when the reviewer
 * explicitly checks "Notify previous agent" (default off).
 */
export async function sendPreviousAgentMatchEndedEmail(
  input: PreviousAgentMatchEndedEmailInput
): Promise<EmailDeliveryResult> {
  const laneLabel = matchLaneEmailLabel(input.matchLane);
  return sendBuiltToRecipients({
    eventType: "match_superseded_agent",
    baseEventKey: input.eventKey ?? null,
    recipients: [
      { email: (input.agentEmail ?? "").trim(), name: input.agentName ?? null, role: "agent" },
    ],
    metadata: {
      clientId: input.clientId ?? null,
      agentId: input.agentId ?? null,
      lane: (input.matchLane ?? "general").toString().toLowerCase(),
      eventType: "match_superseded_agent",
      clientName: input.clientName ?? null,
    },
    build: () =>
      builtFromContent("A REQUITY match has been updated", {
        title: "A REQUITY match has been updated",
        intro: `The REQUITY review team has reassigned ${
          input.clientName || "a client"
        } to a different agent for the ${laneLabel.toLowerCase()} side. No action is needed from you. If you have questions, reply to this email.`,
        details: [
          { label: "Match lane", value: laneLabel },
          { label: "Client", value: input.clientName },
        ],
        ctaLabel: "Open your REQUITY dashboard",
        ctaUrl: dashboardUrlForRole("agent"),
      }),
  });
}

// ---------------------------------------------------------------------------
// Part 2: agent_assessment_completed -> agent (content-rich archetype report).
// ---------------------------------------------------------------------------

export type AgentAssessmentCompletedEmailInput = {
  /** Idempotency key, e.g. `agent_assessment_completed:<agentId>`. */
  eventKey?: string | null;
  agentEmail?: string | null;
  agentName?: string | null;
  archetype?: string | null;
  marketCity?: string | null;
};

/**
 * Email an agent their full archetype report (event type
 * "agent_assessment_completed"). The body contains the archetype summary,
 * strengths, and guidance; the dashboard link is only a secondary CTA.
 */
export async function sendAgentAssessmentCompletedEmail(
  input: AgentAssessmentCompletedEmailInput
): Promise<EmailDeliveryResult> {
  return sendBuiltToRecipients({
    eventType: "agent_assessment_completed",
    baseEventKey: input.eventKey ?? null,
    recipients: [
      { email: (input.agentEmail ?? "").trim(), name: input.agentName ?? null, role: "agent" },
    ],
    metadata: { agentName: input.agentName ?? null },
    build: () =>
      buildAgentArchetypeEmailReport({
        agentName: input.agentName ?? null,
        archetype: input.archetype ?? null,
        marketCity: input.marketCity ?? null,
      }),
  });
}

// ---------------------------------------------------------------------------
// Part 3: client_match_review_started -> client (no login required).
// ---------------------------------------------------------------------------

export type ClientMatchReviewStartedEmailInput = {
  /** Client or lead id, used only for the dedupe event key (never shown). */
  clientIdOrLeadId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
};

/**
 * Email a client that their assessment is received and their match is being
 * reviewed (event type "client_match_review_started"). Contains no agent or
 * reviewer details. Deduped per client + recipient.
 */
export async function sendClientMatchReviewStartedEmail(
  input: ClientMatchReviewStartedEmailInput
): Promise<EmailDeliveryResult> {
  const built = buildClientMatchReviewStartedEmail({ clientName: input.clientName ?? null });
  const id = (input.clientIdOrLeadId ?? "").trim();
  const to = (input.clientEmail ?? "").trim();
  const eventKey = id && to ? `client_match_review_started:${id}:${to.toLowerCase()}` : null;
  const res = await sendAppEmail({
    eventType: "client_match_review_started",
    eventKey,
    to,
    toName: input.clientName ?? null,
    subject: built.subject,
    html: built.html,
    text: built.text,
    tags: ["client_match_review_started"],
    metadata: { ...(built.meta ?? {}), clientId: id || null },
  });
  return toDeliveryResult(res);
}

// ---------------------------------------------------------------------------
// Part 4: client_matched_get_to_know_agent -> client (match finalized).
// ---------------------------------------------------------------------------

export type GetToKnowAgentEmailInput = {
  /** Client or lead id, used only for the dedupe event key (never shown). */
  clientIdOrLeadId?: string | null;
  /** Agent id, used only for the dedupe event key (never shown). */
  agentId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  agentName?: string | null;
  agentEmail?: string | null;
  agentPhone?: string | null;
  /** Only include the phone when the agent approved public display. */
  agentPhonePublic?: boolean;
  agentMarket?: string | null;
  agentArchetype?: string | null;
};

/**
 * Email a matched client a "get to know your agent" report (event type
 * "client_matched_get_to_know_agent"). Tells the client who their agent is and
 * what the agent archetype means, without any login. Deduped per client + agent
 * + recipient.
 */
export async function sendClientMatchedGetToKnowAgentEmail(
  input: GetToKnowAgentEmailInput
): Promise<EmailDeliveryResult> {
  const built = buildGetToKnowAgentEmail({
    clientName: input.clientName ?? null,
    agentName: input.agentName ?? null,
    agentEmail: input.agentEmail ?? null,
    agentPhone: input.agentPhone ?? null,
    agentPhonePublic: input.agentPhonePublic === true,
    agentMarket: input.agentMarket ?? null,
    agentArchetype: input.agentArchetype ?? null,
  });
  const clientId = (input.clientIdOrLeadId ?? "").trim();
  const agentId = (input.agentId ?? "").trim();
  const to = (input.clientEmail ?? "").trim();
  const eventKey =
    clientId && agentId && to
      ? `client_matched_get_to_know_agent:${clientId}:${agentId}:${to.toLowerCase()}`
      : null;
  const res = await sendAppEmail({
    eventType: "client_matched_get_to_know_agent",
    eventKey,
    to,
    toName: input.clientName ?? null,
    subject: built.subject,
    html: built.html,
    text: built.text,
    tags: ["client_matched_get_to_know_agent"],
    metadata: { ...(built.meta ?? {}), clientId: clientId || null, agentId: agentId || null },
  });
  return toDeliveryResult(res);
}

// ---------------------------------------------------------------------------
// Reviewer/admin operational notifications (assessment submitted + matching
// activity). Recipient resolution: REQUITY_REVIEW_EMAIL, then
// ADMIN_NOTIFICATION_EMAIL. When neither is configured the send is recorded as
// a truthful "skipped" with a clear reason; it never blocks the operation.
// Reviewer emails may include reviewer/admin safe operational details, but
// never passwords, tokens, auth ids, or raw private data.
// ---------------------------------------------------------------------------

/** The reviewer/admin notification recipient, or null when not configured. */
export function resolveReviewerRecipient(): string | null {
  const recipient = (env.reviewNotificationEmail ?? "").trim();
  return recipient ? recipient : null;
}

const REVIEWER_RECIPIENT_MISSING =
  "Reviewer recipient is not configured (set REQUITY_REVIEW_EMAIL or ADMIN_NOTIFICATION_EMAIL)";

/**
 * Send a simple reviewer/admin notification email (details + reviewer dashboard
 * CTA). Skips with a clear recorded reason when no reviewer recipient exists.
 */
async function sendReviewerNotification(opts: {
  eventType: string;
  /** Full dedupe key WITHOUT the recipient suffix; recipient is appended here. */
  dedupeBase: string | null;
  subject: string;
  title: string;
  intro: string;
  details: { label: string; value: string | null | undefined }[];
  metadata?: Record<string, unknown>;
}): Promise<EmailDeliveryResult> {
  const recipient = resolveReviewerRecipient();
  if (!recipient) {
    await recordEmailEvent({
      recipientEmail: "(none)",
      templateKey: opts.eventType,
      eventType: opts.eventType,
      provider: resolveEmailProvider(),
      status: "skipped",
      errorMessage: REVIEWER_RECIPIENT_MISSING,
      eventKey: null,
      payload: { ...(opts.metadata ?? {}), reason: REVIEWER_RECIPIENT_MISSING },
    });
    logEmail("EMAIL_SEND_RESULT", {
      provider: resolveEmailProvider(),
      eventType: opts.eventType,
      status: "skipped",
    });
    return {
      emailed: false,
      emailStatus: "skipped",
      recipients: [],
      reason: REVIEWER_RECIPIENT_MISSING,
    };
  }

  const content: EmailContentInput = {
    title: opts.title,
    intro: opts.intro,
    details: opts.details,
    ctaLabel: "Open reviewer dashboard",
    ctaUrl: reviewerDashboardUrl(),
  };
  const res = await sendAppEmail({
    eventType: opts.eventType,
    eventKey: opts.dedupeBase ? `${opts.dedupeBase}:${recipient.toLowerCase()}` : null,
    to: recipient,
    toName: "REQUITY Reviewer",
    subject: opts.subject,
    html: buildRequityEmailHtml(content),
    text: buildPlainTextEmail(content),
    tags: [opts.eventType],
    metadata: opts.metadata,
  });
  return toDeliveryResult(res);
}

/** Human label for a submission source (never exposes internal enum values). */
export function assessmentSourceLabel(source: string | null | undefined): string {
  const s = (source ?? "").toString().trim().toLowerCase();
  if (s === "agent_link") return "Agent link";
  if (s === "qr") return "QR";
  if (s === "client") return "Direct";
  if (s === "reviewer" || s === "requity_reviewer") return "Reviewer link";
  return "Unknown";
}

export type ReviewerAssessmentSubmittedEmailInput = {
  /** Client or lead id (dedupe only, never shown in the email body). */
  clientIdOrLeadId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  transactionIntentLabel?: string | null;
  buyingMarket?: string | null;
  sellingMarket?: string | null;
  generalMarket?: string | null;
  clientArchetype?: string | null;
  /** Final assessment answers (compact labeled rows in the reviewer email). */
  appreciationStyle?: string | null;
  agentExpectationsNotes?: string | null;
  assignedAgentName?: string | null;
  source?: string | null;
  submittedAt?: string | null;
};

/**
 * Part 3: email the reviewer/admin every time a client assessment is submitted
 * (event type "reviewer_assessment_submitted"). Best-effort; a failed or
 * skipped send never blocks assessment submission.
 */
export async function sendReviewerAssessmentSubmittedEmail(
  input: ReviewerAssessmentSubmittedEmailInput
): Promise<EmailDeliveryResult> {
  const id = (input.clientIdOrLeadId ?? "").trim();
  return sendReviewerNotification({
    eventType: "reviewer_assessment_submitted",
    dedupeBase: id ? `reviewer_assessment_submitted:${id}` : null,
    subject: EMAIL_SUBJECTS.reviewerAssessmentSubmitted,
    title: "New assessment submitted",
    intro: `${input.clientName || "A client"} just completed the REQUITY client assessment. The full submission details are below.`,
    details: [
      { label: "Client", value: input.clientName },
      { label: "Email", value: input.clientEmail },
      { label: "Phone", value: input.clientPhone },
      { label: "Transaction", value: input.transactionIntentLabel },
      { label: "Buying market", value: input.buyingMarket },
      { label: "Selling market", value: input.sellingMarket },
      { label: "Market", value: input.generalMarket },
      { label: "Client archetype", value: input.clientArchetype },
      {
        label: "Appreciation style",
        value: formatAppreciationStyle(input.appreciationStyle) ?? "Not answered",
      },
      {
        label: "Additional expectations",
        value: (input.agentExpectationsNotes ?? "").trim() || "Not provided",
      },
      { label: "Assigned agent", value: input.assignedAgentName },
      { label: "Source", value: assessmentSourceLabel(input.source) },
      { label: "Submitted", value: input.submittedAt ?? new Date().toISOString() },
    ],
    metadata: {
      clientName: input.clientName ?? null,
      source: assessmentSourceLabel(input.source),
    },
  });
}

export type ReviewerMatchReviewStartedEmailInput = {
  clientIdOrLeadId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  transactionIntentLabel?: string | null;
  buyingMarket?: string | null;
  sellingMarket?: string | null;
  generalMarket?: string | null;
  reviewerEmail?: string | null;
  status?: string | null;
};

/**
 * Part 4: email the reviewer/admin when match review starts for a client
 * (event type "reviewer_match_review_started"). Deduped per client + recipient.
 */
export async function sendReviewerMatchReviewStartedEmail(
  input: ReviewerMatchReviewStartedEmailInput
): Promise<EmailDeliveryResult> {
  const id = (input.clientIdOrLeadId ?? "").trim();
  return sendReviewerNotification({
    eventType: "reviewer_match_review_started",
    dedupeBase: id ? `reviewer_match_review_started:${id}` : null,
    subject: EMAIL_SUBJECTS.reviewerMatchReviewStarted,
    title: "Match review started",
    intro: `Match review has started for ${input.clientName || "a client"}.`,
    details: [
      { label: "Client", value: input.clientName },
      { label: "Email", value: input.clientEmail },
      { label: "Transaction", value: input.transactionIntentLabel },
      { label: "Buying market", value: input.buyingMarket },
      { label: "Selling market", value: input.sellingMarket },
      { label: "Market", value: input.generalMarket },
      { label: "Reviewer", value: input.reviewerEmail },
      { label: "Status", value: input.status ?? "Match review in progress" },
    ],
    metadata: { clientName: input.clientName ?? null },
  });
}

export type ReviewerMatchFinalizedEmailInput = {
  clientIdOrLeadId?: string | null;
  agentId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  agentName?: string | null;
  agentEmail?: string | null;
  /** buying, selling, general, both, or unknown. */
  matchType?: string | null;
  clientArchetype?: string | null;
  agentArchetype?: string | null;
  locationSummary?: string | null;
  /** Final assessment answers (compact labeled rows in the reviewer email). */
  appreciationStyle?: string | null;
  agentExpectationsNotes?: string | null;
  finalizedAt?: string | null;
  reviewerEmail?: string | null;
};

/**
 * Part 4: email the reviewer/admin when a match is finalized (event type
 * "reviewer_match_finalized"). Deduped per client + agent + match type +
 * recipient, never by agent alone.
 */
export async function sendReviewerMatchFinalizedEmail(
  input: ReviewerMatchFinalizedEmailInput
): Promise<EmailDeliveryResult> {
  const id = (input.clientIdOrLeadId ?? "").trim();
  const agentId = (input.agentId ?? "").trim();
  const matchType = (input.matchType ?? "unknown").trim() || "unknown";
  return sendReviewerNotification({
    eventType: "reviewer_match_finalized",
    dedupeBase:
      id && agentId ? `reviewer_match_finalized:${id}:${agentId}:${matchType}` : null,
    subject: EMAIL_SUBJECTS.reviewerMatchFinalized,
    title: "Match finalized",
    intro: `${input.clientName || "A client"} was matched with ${
      input.agentName || "an agent"
    }.`,
    details: [
      { label: "Client", value: input.clientName },
      { label: "Client email", value: input.clientEmail },
      { label: "Agent", value: input.agentName },
      { label: "Agent email", value: input.agentEmail },
      { label: "Match type", value: matchType },
      { label: "Client archetype", value: input.clientArchetype },
      { label: "Agent archetype", value: input.agentArchetype },
      { label: "Location match", value: input.locationSummary },
      {
        label: "Appreciation style",
        value: formatAppreciationStyle(input.appreciationStyle) ?? "Not answered",
      },
      {
        label: "Additional expectations",
        value: (input.agentExpectationsNotes ?? "").trim() || "Not provided",
      },
      { label: "Finalized", value: input.finalizedAt ?? new Date().toISOString() },
      { label: "Finalized by", value: input.reviewerEmail },
    ],
    metadata: {
      clientName: input.clientName ?? null,
      agentName: input.agentName ?? null,
      matchType,
    },
  });
}

export type ReviewerMatchReplacedEmailInput = {
  clientIdOrLeadId?: string | null;
  oldAgentId?: string | null;
  newAgentId?: string | null;
  clientName?: string | null;
  oldAgentName?: string | null;
  oldAgentEmail?: string | null;
  newAgentName?: string | null;
  newAgentEmail?: string | null;
  matchType?: string | null;
  /** Final assessment answers (compact labeled rows in the reviewer email). */
  appreciationStyle?: string | null;
  agentExpectationsNotes?: string | null;
  replacedAt?: string | null;
  reviewerEmail?: string | null;
  reason?: string | null;
};

/**
 * Part 4: email the reviewer/admin when an active match is replaced (event
 * type "reviewer_match_replaced"). Deduped per client + old agent + new agent
 * + match type + recipient.
 */
export async function sendReviewerMatchReplacedEmail(
  input: ReviewerMatchReplacedEmailInput
): Promise<EmailDeliveryResult> {
  const id = (input.clientIdOrLeadId ?? "").trim();
  const oldId = (input.oldAgentId ?? "").trim() || "none";
  const newId = (input.newAgentId ?? "").trim();
  const matchType = (input.matchType ?? "unknown").trim() || "unknown";
  return sendReviewerNotification({
    eventType: "reviewer_match_replaced",
    dedupeBase:
      id && newId
        ? `reviewer_match_replaced:${id}:${oldId}:${newId}:${matchType}`
        : null,
    subject: EMAIL_SUBJECTS.reviewerMatchReplaced,
    title: "Match replaced",
    intro: `The active match for ${input.clientName || "a client"} was replaced. ${
      input.newAgentName || "A new agent"
    } is now the current match.`,
    details: [
      { label: "Client", value: input.clientName },
      { label: "Previous agent", value: input.oldAgentName },
      { label: "Previous agent email", value: input.oldAgentEmail },
      { label: "New agent", value: input.newAgentName },
      { label: "New agent email", value: input.newAgentEmail },
      { label: "Match type", value: matchType },
      {
        label: "Appreciation style",
        value: formatAppreciationStyle(input.appreciationStyle) ?? "Not answered",
      },
      {
        label: "Additional expectations",
        value: (input.agentExpectationsNotes ?? "").trim() || "Not provided",
      },
      { label: "Replaced", value: input.replacedAt ?? new Date().toISOString() },
      { label: "Replaced by", value: input.reviewerEmail },
      { label: "Reason", value: input.reason },
    ],
    metadata: {
      clientName: input.clientName ?? null,
      newAgentName: input.newAgentName ?? null,
      matchType,
    },
  });
}

