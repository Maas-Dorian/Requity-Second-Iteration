import { env } from "./env.js";
import { logBrevoFailure } from "./logger.js";
import {
  reviewerMatchEmail,
  REVIEWER_MATCH_SUBJECT,
  type ReviewerMatchEmailParams,
  clientAssessmentCompleteEmail,
  CLIENT_COMPLETE_SUBJECT,
  type ClientCompleteEmailParams,
} from "../emails/index.js";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export type EmailRecipient = { email: string; name?: string };

export type BrevoEmail = {
  to: EmailRecipient[];
  subject: string;
  htmlContent: string;
  /** Plain-text alternative. Auto-derived from htmlContent when omitted. */
  textContent?: string;
  replyTo?: EmailRecipient;
  /** Brevo tags for filtering in the dashboard (always includes "requity"). */
  tags?: string[];
};

export type SendResult = {
  /** True only when the email was actually accepted by Brevo. */
  sent: boolean;
  providerMessageId?: string;
  error?: string;
  /** HTTP status from Brevo when a real request was made (for logs). */
  httpStatus?: number;
  /** Safe Brevo error code (e.g. "unauthorized", "invalid_parameter"). */
  errorCode?: string;
  /** True when no API key is configured and the email was logged instead of sent. */
  testMode?: boolean;
};

/** Best-effort HTML → plain text for the textContent alternative. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull a safe, secret-free error code out of a Brevo error JSON payload. */
function brevoErrorCode(data: unknown): string {
  if (data && typeof data === "object") {
    const code = (data as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return "send_error";
}

/**
 * Low-level Brevo transactional email sender.
 *
 * Never throws — always returns a structured {@link SendResult} so a failed
 * email can never break assessment submission. When BREVO_API_KEY is missing it
 * runs in test mode (logs instead of sending) so local/previews keep working.
 *
 * Logs (secret-free): EMAIL_CONFIG_CHECK once per send, then the result via
 * EMAIL_SEND_FAILED on failure. Never logs the API key, body, or tokens.
 */
export async function sendBrevoEmail(email: BrevoEmail): Promise<SendResult> {
  const apiKey = env.brevoApiKey;
  const senderEmail = env.brevoSenderEmail;
  const senderName = env.brevoSenderName;

  // Safe config snapshot — booleans/lengths only, never the key/sender secret.
  try {
    console.log(
      "EMAIL_CONFIG_CHECK",
      JSON.stringify({
        provider: "brevo",
        hasApiKey: Boolean(apiKey),
        hasSenderEmail: Boolean(senderEmail),
        hasSenderName: Boolean(senderName),
        recipientCount: email.to.length,
      })
    );
  } catch {
    /* logging is best-effort */
  }

  if (!apiKey) {
    console.log(
      "[BREVO test mode]",
      email.subject,
      "->",
      email.to.map((t) => t.email).join(", ")
    );
    return { sent: false, testMode: true, providerMessageId: "test-mode" };
  }

  const textContent = email.textContent || htmlToText(email.htmlContent);
  const tags = Array.from(new Set(["requity", ...(email.tags ?? [])]));

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: email.to,
        subject: email.subject,
        htmlContent: email.htmlContent,
        textContent,
        tags,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as { messageId?: string; code?: string };
    if (!response.ok) {
      const errorCode = brevoErrorCode(data);
      const error = JSON.stringify(data);
      logBrevoFailure("sendBrevoEmail", error, {
        subject: email.subject,
        httpStatus: response.status,
        errorCode,
      });
      return { sent: false, error, httpStatus: response.status, errorCode };
    }
    return { sent: true, providerMessageId: data.messageId, httpStatus: response.status };
  } catch (error) {
    logBrevoFailure("sendBrevoEmail", error, { subject: email.subject });
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: "network_error",
    };
  }
}

/**
 * Send the REQUITY reviewer client-match notification to an agent.
 * Used after a reviewer approves a match in the reviewer queue.
 */
export async function sendReviewerMatchEmail(
  to: EmailRecipient,
  params: ReviewerMatchEmailParams
): Promise<SendResult> {
  return sendBrevoEmail({
    to: [to],
    subject: REVIEWER_MATCH_SUBJECT,
    htmlContent: reviewerMatchEmail(params),
  });
}

/**
 * Notify an agent that one of their QR / agent-link clients completed the
 * assessment. No-op-safe in Brevo test mode.
 */
export async function sendClientAssessmentCompleteEmail(
  to: EmailRecipient,
  params: ClientCompleteEmailParams
): Promise<SendResult> {
  return sendBrevoEmail({
    to: [to],
    subject: CLIENT_COMPLETE_SUBJECT,
    htmlContent: clientAssessmentCompleteEmail(params),
  });
}
