import { getOptionalEnv } from "./env.js";
import { sendSendGridEmail } from "./sendgrid.js";
import { sendBrevoEmail } from "./brevo.js";
import {
  recordEmailEvent,
  emailEventAlreadySent,
  type EmailEventStatus,
} from "./emailEvents.js";

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
 * Guarantees:
 *   - Never throws to the caller; always returns a structured delivery result so
 *     a failed email can never break assessment submission or match assignment.
 *   - Never exposes the SendGrid/Brevo API key or env values.
 *   - Dedupes via email_events.event_key when an eventKey is provided.
 *   - Never marks an event "sent" unless the provider returned 2xx.
 */

// Re-exported so callers have a single email surface (Part 2 deliverable).
export { recordEmailEvent } from "./emailEvents.js";

const PRODUCTION_SITE_URL = "https://www.requityapp.com";

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
  /** True only when at least one recipient was actually sent to via Brevo. */
  emailed: boolean;
  emailStatus: EmailDeliveryStatus;
  /** Recipient emails that were targeted (for logs; safe to surface internally). */
  recipients: string[];
  /** Why the send was skipped/failed (safe text, never secrets). */
  reason?: string;
};

export type EmailRole = "agent" | "reviewer" | "admin";
export type EmailTarget = { email: string; name?: string | null; role?: EmailRole };

/**
 * Resolve the public site origin for email CTAs (never localhost, never the old
 * Vercel preview domain). Order: PUBLIC_SITE_URL → VERCEL_FRONTEND_URL → the
 * production domain. All email links must point at https://www.requityapp.com.
 */
export function getPublicSiteUrl(): string {
  const configured = getOptionalEnv(
    "PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "VERCEL_FRONTEND_URL",
    "NEXT_PUBLIC_FRONTEND_URL",
    "VITE_FRONTEND_URL"
  );
  // Ignore localhost AND the deleted preview deployment so email CTA links never
  // point at a dead host, even if a stale VERCEL_FRONTEND_URL is still set.
  const usable =
    configured &&
    !/localhost|127\.0\.0\.1|requity-second-iteration\.vercel\.app/i.test(configured);
  const base = usable ? configured : PRODUCTION_SITE_URL;
  return base.replace(/\/$/, "");
}

export function agentDashboardUrl(): string {
  return `${getPublicSiteUrl()}/agent/dashboard.html`;
}

export function reviewerDashboardUrl(): string {
  return `${getPublicSiteUrl()}/reviewer/index.html`;
}

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
    | "EMAIL_RATE_LIMITED",
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

/** REQUITY email subjects (no cross dashes). */
export const EMAIL_SUBJECTS = {
  assessmentCompleted: "New client assessment completed on REQUITY",
  clientMatched: "New REQUITY match available",
  agentAssessmentCompleted: "Your REQUITY agent archetype is ready",
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
 * Send REQUITY content to one or more recipients through {@link sendAppEmail}.
 * Each recipient gets a per-recipient dedupe key derived from the base event
 * key, so a retry never double-sends but every distinct recipient is notified.
 */
async function sendToRecipients(opts: {
  eventType: string;
  baseEventKey?: string | null;
  subject: string;
  recipients: EmailTarget[];
  buildContent: (r: EmailTarget) => EmailContentInput;
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
    const content = opts.buildContent(r);
    const res = await sendAppEmail({
      eventType: opts.eventType,
      eventKey: opts.baseEventKey ? `${opts.baseEventKey}:${r.email.toLowerCase()}` : null,
      to: r.email,
      toName: r.name ?? null,
      subject: opts.subject,
      html: buildRequityEmailHtml(content),
      text: buildPlainTextEmail(content),
      tags: [opts.eventType],
      metadata: opts.metadata,
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

/** Escape a dynamic value for safe inclusion in HTML email bodies. */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailDetail = { label: string; value: string | null | undefined };

export type EmailContentInput = {
  title: string;
  intro: string;
  details?: EmailDetail[];
  ctaLabel: string;
  ctaUrl: string;
};

/** Keep only detail rows that have a non-empty value. */
function usableDetails(details?: EmailDetail[]): { label: string; value: string }[] {
  return (details ?? [])
    .map((d) => ({ label: d.label, value: (d.value ?? "").toString().trim() }))
    .filter((d) => d.value.length > 0);
}

/**
 * Build a complete, self-contained HTML email (full document) so any provider
 * accepts and renders it. All dynamic values are HTML-escaped. No cross dashes.
 */
export function buildRequityEmailHtml(input: EmailContentInput): string {
  const rows = usableDetails(input.details);
  const detailsHtml = rows.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;border-collapse:collapse;">${rows
        .map(
          (d) =>
            `<tr><td style="padding:6px 0;font-size:14px;color:#777;width:170px;vertical-align:top;">${escapeHtml(
              d.label
            )}</td><td style="padding:6px 0;font-size:15px;color:#1f1f1f;font-weight:600;">${escapeHtml(
              d.value
            )}</td></tr>`
        )
        .join("")}</table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f4ef;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #ece6dc;">
          <tr>
            <td>
              <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#9a5b2e;font-weight:700;">REQUITY</div>
              <h1 style="margin:12px 0 12px;font-size:26px;line-height:1.25;color:#1f1f1f;">${escapeHtml(input.title)}</h1>
              <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#4a4a4a;">${escapeHtml(input.intro)}</p>
              ${detailsHtml}
              <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#b8652f;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:999px;margin-top:22px;">${escapeHtml(input.ctaLabel)}</a>
              <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#777;">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(input.ctaUrl)}</span></p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#9a9a9a;">REQUITY. Real estate agent and client relationship platform.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Build a plain-text fallback from the same content (no cross dashes). */
export function buildPlainTextEmail(input: EmailContentInput): string {
  const rows = usableDetails(input.details);
  const lines = ["REQUITY", "", input.title, "", input.intro];
  if (rows.length) {
    lines.push("");
    for (const d of rows) lines.push(`${d.label}: ${d.value}`);
  }
  lines.push("", `${input.ctaLabel}: ${input.ctaUrl}`);
  return lines.join("\n");
}

export type ClientCompletedEmailInput = {
  /** Idempotency key, e.g. `assessment_completed:<assessmentId>`. */
  eventKey?: string | null;
  recipients: EmailTarget[];
  clientName?: string | null;
  clientEmail?: string | null;
  transactionIntentLabel?: string | null;
  marketCity?: string | null;
  clientArchetype?: string | null;
  assignedAgentName?: string | null;
};

/**
 * Email the relevant agent/reviewer that a client completed the assessment
 * (event type "assessment_completed"). Resolves dashboard links per recipient
 * role, dedupes per recipient, and records the attempt via sendAppEmail.
 */
export async function sendClientAssessmentCompletedEmail(
  input: ClientCompletedEmailInput
): Promise<EmailDeliveryResult> {
  return sendToRecipients({
    eventType: "assessment_completed",
    baseEventKey: input.eventKey ?? null,
    subject: EMAIL_SUBJECTS.assessmentCompleted,
    recipients: input.recipients,
    metadata: {
      clientName: input.clientName ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
      archetype: input.clientArchetype ?? null,
    },
    buildContent: (r) => ({
      title: "New client assessment completed",
      intro: `${input.clientName || "A client"} just completed their REQUITY assessment. Open your dashboard to view the full relational report.`,
      details: [
        { label: "Client", value: input.clientName },
        { label: "Client email", value: input.clientEmail },
        { label: "Archetype", value: input.clientArchetype },
        { label: "Transaction", value: input.transactionIntentLabel },
        { label: "Market", value: input.marketCity },
        { label: "Assigned agent", value: input.assignedAgentName },
      ],
      ctaLabel: "View in REQUITY",
      ctaUrl: dashboardUrlForRole(r.role),
    }),
  });
}

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
  return sendToRecipients({
    eventType: "client_matched",
    baseEventKey: input.eventKey ?? null,
    subject: EMAIL_SUBJECTS.clientMatched,
    recipients: input.recipients,
    metadata: {
      clientName: input.clientName ?? null,
      agentName: input.agentName ?? null,
      matchLabel: input.matchLabel ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
    },
    buildContent: (r) => ({
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

export type AgentAssessmentCompletedEmailInput = {
  /** Idempotency key, e.g. `agent_assessment_completed:<agentId>`. */
  eventKey?: string | null;
  agentEmail?: string | null;
  agentName?: string | null;
  archetype?: string | null;
  marketCity?: string | null;
};

/**
 * Email an agent that their archetype assessment is complete (event type
 * "agent_assessment_completed"), with a CTA to the agent dashboard. Sends full
 * HTML plus a plain-text fallback via sendAppEmail. Never throws.
 */
export async function sendAgentAssessmentCompletedEmail(
  input: AgentAssessmentCompletedEmailInput
): Promise<EmailDeliveryResult> {
  return sendToRecipients({
    eventType: "agent_assessment_completed",
    baseEventKey: input.eventKey ?? null,
    subject: EMAIL_SUBJECTS.agentAssessmentCompleted,
    recipients: [{ email: (input.agentEmail ?? "").trim(), name: input.agentName ?? null, role: "agent" }],
    metadata: { agentName: input.agentName ?? null, archetype: input.archetype ?? null },
    buildContent: () => ({
      title: "Your REQUITY agent archetype is ready",
      intro: `Your assessment is complete. ${
        input.archetype
          ? `Your agent archetype is ${input.archetype}.`
          : "Your agent archetype has been saved."
      } REQUITY uses this when reviewing future client matches.`,
      details: [
        { label: "Agent", value: input.agentName },
        { label: "Archetype", value: input.archetype },
        { label: "Market", value: input.marketCity },
      ],
      ctaLabel: "View in REQUITY",
      ctaUrl: agentDashboardUrl(),
    }),
  });
}
