import { getOptionalEnv } from "./env.js";

/**
 * Low-level Twilio SendGrid transactional email sender (server-side ONLY).
 *
 * Talks to the SendGrid v3 Mail Send API. Never throws, always returns a
 * structured {@link SendGridSendResult} so a failed email can never break
 * assessment submission or match assignment. Never exposes the API key.
 *
 * SendGrid rules honored here:
 *   - Authorization: Bearer <SENDGRID_API_KEY> (never Brevo's api-key header).
 *   - content[] array with text/plain first, then text/html (no htmlContent).
 *   - HTTP 202 (any 2xx) is success; the body is usually empty on success.
 *   - x-message-id response header is captured as provider_message_id.
 *   - HTTP 429 is surfaced as rateLimited so callers can mark rate_limited.
 */

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

/** Approved default sender. Overridable via SENDGRID_SENDER_EMAIL. */
const DEFAULT_SENDER_EMAIL = "info@requityapp.com";
const DEFAULT_SENDER_NAME = "REQUITY";

export type SendGridSendParams = {
  to: string;
  toName?: string | null;
  subject: string;
  /** Plain-text alternative (rendered first in the content array). */
  text: string;
  /** Full HTML document. */
  html: string;
  /** SendGrid categories (dashboard filtering). "requity" is always included. */
  categories?: string[];
};

export type SendGridSendResult = {
  /** True only when SendGrid accepted the email (2xx). */
  sent: boolean;
  /** HTTP status from SendGrid when a request was made (for logs). */
  httpStatus: number | null;
  /** SendGrid x-message-id header when present. */
  providerMessageId: string | null;
  /** True when SendGrid returned HTTP 429. */
  rateLimited: boolean;
  /** Safe, secret-free error text when the send failed. */
  errorMessage: string | null;
};

/** Parse a SendGrid error body into a short, safe message (never secrets). */
function safeErrorFromBody(status: number, bodyText: string): string {
  try {
    const data = JSON.parse(bodyText) as { errors?: Array<{ message?: string; field?: string }> };
    if (Array.isArray(data?.errors) && data.errors.length) {
      const first = data.errors[0];
      const field = first?.field ? ` (field: ${first.field})` : "";
      if (first?.message) return `${first.message}${field}`.slice(0, 300);
    }
  } catch {
    // not JSON, fall through to trimmed text
  }
  const trimmed = (bodyText || "").trim();
  if (trimmed) return trimmed.slice(0, 300);
  return `SendGrid returned HTTP ${status}`;
}

export async function sendSendGridEmail(params: SendGridSendParams): Promise<SendGridSendResult> {
  const apiKey = getOptionalEnv("SENDGRID_API_KEY");
  const senderEmail = getOptionalEnv("SENDGRID_SENDER_EMAIL") ?? DEFAULT_SENDER_EMAIL;
  const senderName = getOptionalEnv("SENDGRID_SENDER_NAME") ?? DEFAULT_SENDER_NAME;

  // Safe config snapshot: booleans only, never the key or sender secret.
  try {
    console.log(
      "EMAIL_CONFIG_CHECK",
      JSON.stringify({
        provider: "sendgrid",
        hasApiKey: Boolean(apiKey),
        hasSenderEmail: Boolean(senderEmail),
        hasSenderName: Boolean(senderName),
      })
    );
  } catch {
    /* logging is best-effort */
  }

  if (!apiKey) {
    return {
      sent: false,
      httpStatus: null,
      providerMessageId: null,
      rateLimited: false,
      errorMessage: "SENDGRID_API_KEY is not configured",
    };
  }

  // SendGrid allows up to 10 categories, each up to 255 chars.
  const categories = Array.from(new Set(["requity", ...(params.categories ?? [])]))
    .filter((c) => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.slice(0, 255))
    .slice(0, 10);

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          { to: [{ email: params.to, name: params.toName || params.to }] },
        ],
        from: { email: senderEmail, name: senderName },
        subject: params.subject,
        content: [
          { type: "text/plain", value: params.text },
          { type: "text/html", value: params.html },
        ],
        categories,
      }),
    });

    const providerMessageId = response.headers.get("x-message-id");

    // Treat any 2xx (SendGrid returns 202 Accepted, often with an empty body).
    if (response.status >= 200 && response.status < 300) {
      return {
        sent: true,
        httpStatus: response.status,
        providerMessageId,
        rateLimited: false,
        errorMessage: null,
      };
    }

    const bodyText = await response.text().catch(() => "");
    return {
      sent: false,
      httpStatus: response.status,
      providerMessageId,
      rateLimited: response.status === 429,
      errorMessage: safeErrorFromBody(response.status, bodyText),
    };
  } catch (error) {
    return {
      sent: false,
      httpStatus: null,
      providerMessageId: null,
      rateLimited: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
