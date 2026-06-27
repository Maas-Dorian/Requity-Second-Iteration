import { getOptionalEnv } from "./env.js";
import { sendBrevoEmail, type SendResult } from "./brevo.js";
import {
  clientAssessmentCompleteEmail,
  CLIENT_COMPLETE_SUBJECT,
  clientMatchEmail,
  CLIENT_MATCH_SUBJECT,
} from "../emails/index.js";
import { recordEmailEvent, emailEventAlreadySent } from "./emailEvents.js";

/**
 * High-level REQUITY email orchestration (server-side ONLY).
 *
 * This module owns *what* to send and *to whom*, plus idempotency/dedupe and
 * audit recording. The actual Brevo transport lives in backend/lib/brevo.ts
 * (sendBrevoEmail) and is reused here. Nothing in this file is import-safe for
 * the browser — it reads server env and the Brevo API key.
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
  /** Why the send was skipped/failed (safe text — never secrets). */
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
  const base =
    configured && !/localhost|127\.0\.0\.1/i.test(configured) ? configured : PRODUCTION_SITE_URL;
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
 * sender values, or full HTML payloads — only event type, status, recipient
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
    // not JSON — fall through to a generic code
  }
  return "send_error";
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
    const html = clientAssessmentCompleteEmail({
      clientName: input.clientName ?? null,
      clientEmail: input.clientEmail ?? null,
      assignedAgentName: input.assignedAgentName ?? null,
      archetype: input.clientArchetype ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
      dashboardUrl: dashboardUrlForRole(r.role),
    });
    const send = await sendBrevoEmail({
      to: [{ email: r.email, name: r.name ?? undefined }],
      subject: CLIENT_COMPLETE_SUBJECT,
      htmlContent: html,
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
    const html = clientMatchEmail({
      clientName: input.clientName ?? null,
      clientArchetype: input.clientArchetype ?? null,
      agentName: input.agentName ?? null,
      matchLabel: input.matchLabel ?? null,
      transaction: input.transactionIntentLabel ?? null,
      market: input.marketCity ?? null,
      dashboardUrl: dashboardUrlForRole(r.role),
    });
    const send = await sendBrevoEmail({
      to: [{ email: r.email, name: r.name ?? undefined }],
      subject: CLIENT_MATCH_SUBJECT,
      htmlContent: html,
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
