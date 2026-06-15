import { env } from "./env";
import { logBrevoFailure } from "./logger";
import {
  reviewerMatchEmail,
  REVIEWER_MATCH_SUBJECT,
  type ReviewerMatchEmailParams,
  clientAssessmentCompleteEmail,
  CLIENT_COMPLETE_SUBJECT,
  type ClientCompleteEmailParams,
} from "../emails";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export type EmailRecipient = { email: string; name?: string };

export type BrevoEmail = {
  to: EmailRecipient[];
  subject: string;
  htmlContent: string;
  replyTo?: EmailRecipient;
};

export type SendResult = {
  /** True only when the email was actually accepted by Brevo. */
  sent: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when no API key is configured and the email was logged instead of sent. */
  testMode?: boolean;
};

/**
 * Low-level Brevo transactional email sender.
 *
 * Never throws — always returns a structured {@link SendResult} so a failed
 * email can never break assessment submission. When BREVO_API_KEY is missing it
 * runs in test mode (logs instead of sending) so local/previews keep working.
 */
export async function sendBrevoEmail(email: BrevoEmail): Promise<SendResult> {
  const apiKey = env.brevoApiKey;

  if (!apiKey) {
    console.log(
      "[BREVO test mode]",
      email.subject,
      "->",
      email.to.map((t) => t.email).join(", ")
    );
    return { sent: false, testMode: true, providerMessageId: "test-mode" };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { email: env.brevoSenderEmail, name: env.brevoSenderName },
        to: email.to,
        subject: email.subject,
        htmlContent: email.htmlContent,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as { messageId?: string };
    if (!response.ok) {
      const error = JSON.stringify(data);
      logBrevoFailure("sendBrevoEmail", error, { subject: email.subject });
      return { sent: false, error };
    }
    return { sent: true, providerMessageId: data.messageId };
  } catch (error) {
    logBrevoFailure("sendBrevoEmail", error, { subject: email.subject });
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
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
