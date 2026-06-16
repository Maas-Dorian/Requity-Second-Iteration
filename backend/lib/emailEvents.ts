import { getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  sendReviewerMatchEmail,
  sendClientAssessmentCompleteEmail,
  type EmailRecipient,
  type SendResult,
} from "./brevo.js";
import type { ReviewerMatchEmailParams, ClientCompleteEmailParams } from "../emails/index.js";

/**
 * Email event logging + send-and-record helpers.
 *
 * Keeps Brevo sending (backend/lib/brevo.ts) decoupled from persistence so the
 * assessment and matching flows can fire emails with a single call and always
 * leave an audit trail in the `email_events` table.
 */

export type EmailEventStatus = "queued" | "sent" | "failed" | "test_mode";

export type RecordEmailEventParams = {
  recipientEmail: string;
  templateKey: string;
  brevoMessageId?: string | null;
  payload?: Record<string, unknown>;
  status?: EmailEventStatus;
};

export type EmailEventRecord = {
  id: string;
  recipient_email: string;
  template_key: string;
  brevo_message_id: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};

export async function recordEmailEvent(
  params: RecordEmailEventParams
): Promise<EmailEventRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("email_events")
    .insert({
      recipient_email: params.recipientEmail,
      template_key: params.templateKey,
      brevo_message_id: params.brevoMessageId ?? null,
      payload: params.payload ?? {},
      status: params.status ?? "queued",
    })
    .select()
    .single();

  if (error) throw new Error(`recordEmailEvent failed: ${error.message}`);
  return data as EmailEventRecord;
}

function statusFromResult(result: SendResult): EmailEventStatus {
  if (result.testMode) return "test_mode";
  return result.sent ? "sent" : "failed";
}

/**
 * Send the REQUITY reviewer match email and record the attempt in email_events.
 * Safe to call from the reviewer approval flow.
 */
export async function sendAndRecordReviewerMatchEmail(
  to: EmailRecipient,
  params: ReviewerMatchEmailParams
): Promise<{ send: SendResult; event: EmailEventRecord | null }> {
  const send = await sendReviewerMatchEmail(to, params);

  let event: EmailEventRecord | null = null;
  try {
    event = await recordEmailEvent({
      recipientEmail: to.email,
      templateKey: "reviewer_match",
      brevoMessageId: send.providerMessageId ?? null,
      payload: { clientName: params.clientName, agentName: params.agentName ?? null },
      status: statusFromResult(send),
    });
  } catch (error) {
    console.error("[emailEvents] Failed to record reviewer match email:", error);
  }

  return { send, event };
}

/**
 * Send the client-completed email to an agent and record it in email_events.
 * Used by the QR / agent-link client submission flow.
 */
export async function sendAndRecordClientCompleteEmail(
  to: EmailRecipient,
  params: ClientCompleteEmailParams
): Promise<{ send: SendResult; event: EmailEventRecord | null }> {
  const send = await sendClientAssessmentCompleteEmail(to, params);

  let event: EmailEventRecord | null = null;
  try {
    event = await recordEmailEvent({
      recipientEmail: to.email,
      templateKey: "client_complete",
      brevoMessageId: send.providerMessageId ?? null,
      payload: {
        clientName: params.clientName,
        agentName: params.agentName ?? null,
        archetype: params.archetype ?? null,
      },
      status: statusFromResult(send),
    });
  } catch (error) {
    console.error("[emailEvents] Failed to record client complete email:", error);
  }

  return { send, event };
}
