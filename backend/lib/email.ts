import { getOptionalEnv } from "./env.js";
import { sendBrevoEmail, type SendResult } from "./brevo.js";
import { recordEmailEvent, emailEventAlreadySent } from "./emailEvents.js";

/**
 * High-level REQUITY email orchestration (server-side ONLY).
 *
 * This module owns *what* to send and *to whom*, plus idempotency/dedupe and
 * audit recording. The actual Brevo transport lives in backend/lib/brevo.ts
 * (sendBrevoEmail) and is reused here. Nothing in this file is import-safe for
 * the browser, it reads server env and the Brevo API key.
 *
 * Guarantees:
 *   - Never throws to the caller; always returns a structured delivery result so
 *     a failed email can never break assessment submission or match assignment.
 *   - Never exposes the Brevo API key or env values.
 *   - Dedupes via email_events.event_key when an eventKey is provided.
 */

// Re-exported so callers have a single email surface (Part 2 deliverable).
export { sendBrevoEmail } from "./brevo.js";
export { recordEmailEvent } from "./emailEvents.js";

const PRODUCTION_SITE_URL = "https://www.requityapp.com";

export type EmailDeliveryStatus = "sent" | "skipped" | "failed";

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

function aggregateStatus(results: SendResult[]): EmailDeliveryStatus {
  if (results.some((r) => r.sent)) return "sent";
  // No real send happened. Test mode (no API key) => skipped, otherwise failed.
  if (results.length && results.every((r) => r.testMode)) return "skipped";
  return "failed";
}

function firstMessageId(results: SendResult[]): string | null {
  for (const r of results) if (r.sent && r.providerMessageId) return r.providerMessageId;
  return null;
}

function firstError(results: SendResult[]): string | null {
  for (const r of results) if (!r.sent && r.error) return r.error;
  return null;
}

/**
 * Safe structured email logging for Vercel. Never logs the Brevo API key,
 * sender values, or full HTML payloads, only event type, status, recipient
 * presence and short error text.
 */
function logEmailEvent(
  tag: "EMAIL_SEND_ATTEMPT" | "EMAIL_SEND_RESULT" | "EMAIL_SEND_FAILED",
  fields: Record<string, unknown>
): void {
  try {
    console.log(tag, JSON.stringify({ provider: "brevo", ...fields }));
  } catch {
    console.log(tag, { provider: "brevo", ...fields });
  }
}

/** Short, secret-free error code for logs (e.g. the Brevo error `code`). */
function safeErrorCode(message: string | null): string {
  if (!message) return "unknown";
  try {
    const parsed = JSON.parse(message) as { code?: string };
    if (parsed && typeof parsed.code === "string") return parsed.code;
  } catch {
    // not JSON, fall through to a generic code
  }
  return "send_error";
}

/** REQUITY email subjects (no cross dashes). */
export const EMAIL_SUBJECTS = {
  assessmentCompleted: "New client assessment completed on REQUITY",
  clientMatched: "New REQUITY match available",
  agentAssessmentCompleted: "Your REQUITY agent archetype is ready",
  testEmail: "REQUITY Brevo test email",
} as const;

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
 * Build a complete, self-contained HTML email (full document) so Brevo accepts
 * and renders it. All dynamic values are HTML-escaped. Contains no cross dashes.
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
 * Email the relevant agent/reviewer that a client completed the assessment.
 * Resolves dashboard links per recipient role, dedupes by eventKey, and records
 * the attempt in email_events. Returns a safe delivery result.
 */
export async function sendClientAssessmentCompletedEmail(
  input: ClientCompletedEmailInput
): Promise<EmailDeliveryResult> {
  const recipients = normalizeTargets(input.recipients);
  logEmailEvent("EMAIL_SEND_ATTEMPT", {
    eventType: "assessment_completed",
    recipientFound: recipients.length > 0,
  });

  if (!recipients.length) {
    await recordEmailEvent({
      recipientEmail: "(none)",
      templateKey: "client_complete",
      eventType: "assessment_completed",
      status: "skipped",
      errorMessage: "No recipient found",
      eventKey: null,
      payload: { reason: "No recipient found", clientName: input.clientName ?? null },
    });
    logEmailEvent("EMAIL_SEND_RESULT", { eventType: "assessment_completed", status: "skipped" });
    return { emailed: false, emailStatus: "skipped", recipients: [], reason: "No recipient found" };
  }

  if (input.eventKey && (await emailEventAlreadySent(input.eventKey))) {
    await recordEmailEvent({
      recipientEmail: recipients[0].email,
      templateKey: "client_complete",
      eventType: "assessment_completed",
      status: "deduped",
      eventKey: null,
      payload: { reason: "Already sent (duplicate event)", recipients: recipients.map((r) => r.email) },
    });
    logEmailEvent("EMAIL_SEND_RESULT", { eventType: "assessment_completed", status: "deduped" });
    return {
      emailed: false,
      emailStatus: "skipped",
      recipients: recipients.map((r) => r.email),
      reason: "Already sent (duplicate event)",
    };
  }

  const results: SendResult[] = [];
  for (const r of recipients) {
    const content: EmailContentInput = {
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
    };
    const send = await sendBrevoEmail({
      to: [{ email: r.email, name: r.name ?? undefined }],
      subject: EMAIL_SUBJECTS.assessmentCompleted,
      htmlContent: buildRequityEmailHtml(content),
      textContent: buildPlainTextEmail(content),
      tags: ["assessment_completed"],
    });
    results.push(send);
  }

  const status = aggregateStatus(results);
  await recordEmailEvent({
    recipientEmail: recipients[0].email,
    templateKey: "client_complete",
    eventType: "assessment_completed",
    status,
    // Only persist the dedupe key on success so failures/test-mode can retry.
    eventKey: status === "sent" ? input.eventKey ?? null : null,
    brevoMessageId: firstMessageId(results),
    errorMessage: status === "failed" ? firstError(results) : null,
    payload: {
      clientName: input.clientName ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
      archetype: input.clientArchetype ?? null,
      recipients: recipients.map((r) => r.email),
    },
  });

  logEmailEvent("EMAIL_SEND_RESULT", { eventType: "assessment_completed", status });
  if (status === "failed") {
    const message = firstError(results);
    logEmailEvent("EMAIL_SEND_FAILED", {
      eventType: "assessment_completed",
      code: safeErrorCode(message),
      message: message ?? "send failed",
    });
  }

  return {
    emailed: status === "sent",
    emailStatus: status,
    recipients: recipients.map((r) => r.email),
  };
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
 * ready to review. Dedupes by eventKey and records the attempt. Safe result.
 */
export async function sendClientMatchedEmail(
  input: ClientMatchedEmailInput
): Promise<EmailDeliveryResult> {
  const recipients = normalizeTargets(input.recipients);
  logEmailEvent("EMAIL_SEND_ATTEMPT", {
    eventType: "client_matched",
    recipientFound: recipients.length > 0,
  });

  if (!recipients.length) {
    await recordEmailEvent({
      recipientEmail: "(none)",
      templateKey: "client_matched",
      eventType: "client_matched",
      status: "skipped",
      errorMessage: "No recipient found",
      eventKey: null,
      payload: { reason: "No recipient found", clientName: input.clientName ?? null },
    });
    logEmailEvent("EMAIL_SEND_RESULT", { eventType: "client_matched", status: "skipped" });
    return { emailed: false, emailStatus: "skipped", recipients: [], reason: "No recipient found" };
  }

  if (input.eventKey && (await emailEventAlreadySent(input.eventKey))) {
    await recordEmailEvent({
      recipientEmail: recipients[0].email,
      templateKey: "client_matched",
      eventType: "client_matched",
      status: "deduped",
      eventKey: null,
      payload: { reason: "Already sent (duplicate event)", recipients: recipients.map((r) => r.email) },
    });
    logEmailEvent("EMAIL_SEND_RESULT", { eventType: "client_matched", status: "deduped" });
    return {
      emailed: false,
      emailStatus: "skipped",
      recipients: recipients.map((r) => r.email),
      reason: "Already sent (duplicate event)",
    };
  }

  const results: SendResult[] = [];
  for (const r of recipients) {
    const content: EmailContentInput = {
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
    };
    const send = await sendBrevoEmail({
      to: [{ email: r.email, name: r.name ?? undefined }],
      subject: EMAIL_SUBJECTS.clientMatched,
      htmlContent: buildRequityEmailHtml(content),
      textContent: buildPlainTextEmail(content),
      tags: ["client_matched"],
    });
    results.push(send);
  }

  const status = aggregateStatus(results);
  await recordEmailEvent({
    recipientEmail: recipients[0].email,
    templateKey: "client_matched",
    eventType: "client_matched",
    status,
    eventKey: status === "sent" ? input.eventKey ?? null : null,
    brevoMessageId: firstMessageId(results),
    errorMessage: status === "failed" ? firstError(results) : null,
    payload: {
      clientName: input.clientName ?? null,
      agentName: input.agentName ?? null,
      matchLabel: input.matchLabel ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
      recipients: recipients.map((r) => r.email),
    },
  });

  logEmailEvent("EMAIL_SEND_RESULT", { eventType: "client_matched", status });
  if (status === "failed") {
    const message = firstError(results);
    logEmailEvent("EMAIL_SEND_FAILED", {
      eventType: "client_matched",
      code: safeErrorCode(message),
      message: message ?? "send failed",
    });
  }

  return {
    emailed: status === "sent",
    emailStatus: status,
    recipients: recipients.map((r) => r.email),
  };
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
 * Email an agent that their archetype assessment is complete, with a CTA to the
 * dashboard. Sends a full HTML email plus a plain-text fallback. Never throws,
 * dedupes by eventKey, and records the attempt in email_events.
 */
export async function sendAgentAssessmentCompletedEmail(
  input: AgentAssessmentCompletedEmailInput
): Promise<EmailDeliveryResult> {
  const email = (input.agentEmail ?? "").trim();
  logEmailEvent("EMAIL_SEND_ATTEMPT", {
    eventType: "agent_assessment_completed",
    recipientFound: email.length > 0,
  });

  if (!email) {
    await recordEmailEvent({
      recipientEmail: "(none)",
      templateKey: "agent_assessment_completed",
      eventType: "agent_assessment_completed",
      status: "skipped",
      errorMessage: "No recipient found",
      eventKey: null,
      payload: { reason: "No recipient found", agentName: input.agentName ?? null },
    });
    logEmailEvent("EMAIL_SEND_RESULT", { eventType: "agent_assessment_completed", status: "skipped" });
    return { emailed: false, emailStatus: "skipped", recipients: [], reason: "No recipient found" };
  }

  if (input.eventKey && (await emailEventAlreadySent(input.eventKey))) {
    await recordEmailEvent({
      recipientEmail: email,
      templateKey: "agent_assessment_completed",
      eventType: "agent_assessment_completed",
      status: "deduped",
      eventKey: null,
      payload: { reason: "Already sent (duplicate event)" },
    });
    logEmailEvent("EMAIL_SEND_RESULT", { eventType: "agent_assessment_completed", status: "deduped" });
    return {
      emailed: false,
      emailStatus: "skipped",
      recipients: [email],
      reason: "Already sent (duplicate event)",
    };
  }

  const content: EmailContentInput = {
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
  };

  const send = await sendBrevoEmail({
    to: [{ email, name: input.agentName ?? undefined }],
    subject: EMAIL_SUBJECTS.agentAssessmentCompleted,
    htmlContent: buildRequityEmailHtml(content),
    textContent: buildPlainTextEmail(content),
    tags: ["agent_assessment_completed"],
  });

  const status = aggregateStatus([send]);
  await recordEmailEvent({
    recipientEmail: email,
    templateKey: "agent_assessment_completed",
    eventType: "agent_assessment_completed",
    status,
    eventKey: status === "sent" ? input.eventKey ?? null : null,
    brevoMessageId: firstMessageId([send]),
    errorMessage: status === "failed" ? firstError([send]) : null,
    payload: { agentName: input.agentName ?? null, archetype: input.archetype ?? null },
  });

  logEmailEvent("EMAIL_SEND_RESULT", { eventType: "agent_assessment_completed", status });
  if (status === "failed") {
    const message = firstError([send]);
    logEmailEvent("EMAIL_SEND_FAILED", {
      eventType: "agent_assessment_completed",
      code: safeErrorCode(message),
      message: message ?? "send failed",
    });
  }

  return { emailed: status === "sent", emailStatus: status, recipients: [email] };
}
