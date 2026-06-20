import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { insertWithSchemaFallback, isMissingTableError, isMissingColumnError } from "./supabaseWrite.js";

/**
 * Email event logging + send-and-record helpers.
 *
 * Keeps Brevo sending (backend/lib/brevo.ts) decoupled from persistence so the
 * assessment and matching flows can fire emails with a single call and always
 * leave an audit trail in the `email_events` table.
 */

export type EmailEventStatus = "queued" | "sent" | "failed" | "test_mode" | "skipped";

export type RecordEmailEventParams = {
  recipientEmail: string;
  templateKey: string;
  brevoMessageId?: string | null;
  payload?: Record<string, unknown>;
  status?: EmailEventStatus;
  /** Unique idempotency key (e.g. "assessment_completed:<id>"). Enables dedupe. */
  eventKey?: string | null;
  /** Coarse event type ("assessment_completed" | "client_matched" | ...). */
  eventType?: string | null;
  /** Safe error string when the send failed (never contains secrets). */
  errorMessage?: string | null;
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

/**
 * Insert an email_events audit row. Resilient to live-schema drift: the
 * dedupe/enrichment columns (event_key, event_type, provider, ...) are dropped
 * automatically if the live table predates migration 0004, so recording an
 * event never breaks the email flow. Returns null when the table is absent.
 */
export async function recordEmailEvent(
  params: RecordEmailEventParams
): Promise<EmailEventRecord | null> {
  try {
    const { data } = await insertWithSchemaFallback<EmailEventRecord>(
      "email_events",
      {
        recipient_email: params.recipientEmail,
        template_key: params.templateKey,
        brevo_message_id: params.brevoMessageId ?? null,
        payload: params.payload ?? {},
        status: params.status ?? "queued",
        // Dedupe + enrichment columns (migration 0004). Dropped if missing live.
        event_key: params.eventKey ?? null,
        event_type: params.eventType ?? null,
        provider: "brevo",
        provider_message_id: params.brevoMessageId ?? null,
        error_message: params.errorMessage ?? null,
        metadata: params.payload ?? {},
      },
      { required: ["recipient_email", "template_key"] }
    );
    return data;
  } catch (error) {
    // Missing table → nothing to record (audit is best-effort, never fatal).
    if (isMissingTableError(error)) return null;
    console.error("[emailEvents] recordEmailEvent failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * True when an email with this idempotency key has already been recorded.
 * Resilient: if the `event_key` column or the table is missing on the live DB,
 * dedupe is treated as "not sent before" (returns false) so sending proceeds.
 */
export async function emailEventAlreadySent(eventKey: string): Promise<boolean> {
  if (!eventKey) return false;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("email_events")
      .select("id,status")
      .eq("event_key", eventKey)
      .limit(1);
    if (error) {
      // Unknown column / missing table → cannot dedupe; allow the send.
      if (isMissingColumnError(error) || isMissingTableError(error)) return false;
      console.error("[emailEvents] dedupe lookup failed:", error.message);
      return false;
    }
    if (!data || !data.length) return false;
    // Only treat a prior SUCCESSFUL/queued send as a duplicate; retry failures.
    const status = String((data[0] as { status?: string }).status ?? "");
    return status === "sent" || status === "queued" || status === "test_mode";
  } catch (error) {
    if (isMissingColumnError(error) || isMissingTableError(error)) return false;
    console.error("[emailEvents] dedupe lookup error:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * NOTE: High-level "send + record" orchestration now lives in
 * backend/lib/email.ts (sendClientAssessmentCompletedEmail /
 * sendClientMatchedEmail). This module is the persistence/dedupe layer only.
 */
