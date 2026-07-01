import { getOptionalEnv } from "./env.js";
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
  agentDashboardUrl,
  reviewerDashboardUrl,
  type EmailContentInput,
} from "./emailTemplate.js";
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
  clientMatched: "New REQUITY match available",
  agentAssessmentCompleted: "Your REQUITY agent archetype is ready",
  matchReviewStarted: "Your REQUITY match is being reviewed",
  getToKnowAgent: "Get to know your REQUITY agent",
  testEmail: "REQUITY SendGrid test email",
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

export type ClientMatchedEmailInput = {
  /** Idempotency key, e.g. `client_matched:<clientId>:<agentId>`. */
  eventKey?: string | null;
  recipients: EmailTarget[];
  clientName?: string | null;
  clientArchetype?: string | null;
  agentName?: string | null;
  matchLabel?: string | null;
  transactionIntentLabel?: string | null;
  marketCity?: string | null;
};

/**
 * Email the matched agent (and optional reviewer/admin) that a REQUITY match is
 * ready to review (event type "client_matched"). Dedupes per recipient.
 */
export async function sendClientMatchedEmail(
  input: ClientMatchedEmailInput
): Promise<EmailDeliveryResult> {
  return sendBuiltToRecipients({
    eventType: "client_matched",
    baseEventKey: input.eventKey ?? null,
    recipients: input.recipients,
    metadata: {
      clientName: input.clientName ?? null,
      agentName: input.agentName ?? null,
      matchLabel: input.matchLabel ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
    },
    build: (r) =>
      builtFromContent(EMAIL_SUBJECTS.clientMatched, {
        title: "A new REQUITY match is ready",
        intro: `${
          input.clientName || "A client"
        } has been matched and is ready for your review. Open your dashboard to see the match details.`,
        details: [
          { label: "Client", value: input.clientName },
          { label: "Client archetype", value: input.clientArchetype },
          { label: "Agent", value: input.agentName },
          { label: "Match", value: input.matchLabel },
          { label: "Transaction", value: input.transactionIntentLabel },
          { label: "Market", value: input.marketCity },
        ],
        ctaLabel: "View match in REQUITY",
        ctaUrl: dashboardUrlForRole(r.role),
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
