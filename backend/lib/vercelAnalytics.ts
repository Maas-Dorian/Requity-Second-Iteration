/**
 * REQUITY server-side analytics helper (Vercel Web Analytics custom events).
 *
 * Server events are the source of truth for confirmed business outcomes
 * (completed assessments, finished matches, sent emails). They are fired ONLY
 * after the underlying database operation succeeds, and an analytics failure
 * never fails the API operation: every call is wrapped so it cannot throw.
 *
 * Privacy rules (enforced here, not left to call sites):
 *   - properties must be flat primitives (string | number | boolean | null)
 *   - nested objects/arrays are dropped
 *   - undefined properties are removed
 *   - strings are truncated to 255 characters
 * Never pass names, emails, phones, free-text answers, tokens, or raw ids.
 *
 * Custom events require a supported Vercel plan; when unavailable the track
 * call is a silent no-op and business operations are unaffected.
 */
import { track } from "@vercel/analytics/server";

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;
const MAX_PROPS = 20;
const MAX_STRING = 255;

/** Central event-name registry shared by server call sites. */
export const ANALYTICS_EVENTS = {
  // Client funnel (server-confirmed)
  CLIENT_ASSESSMENT_COMPLETED: "client_assessment_completed",
  CLIENT_ASSESSMENT_SUBMISSION_FAILED: "client_assessment_submission_failed",
  CLIENT_PARTIAL_MATCH_COMPLETED: "client_partial_match_completed",
  CLIENT_MATCH_FULLY_COMPLETED: "client_match_fully_completed",
  CLIENT_FINAL_MATCH_EMAIL_SENT: "client_final_match_email_sent",
  // Agent funnel (server-confirmed)
  AGENT_ACCOUNT_CREATED: "agent_account_created",
  AGENT_SIGNUP_COMPLETED: "agent_signup_completed",
  AGENT_ASSESSMENT_COMPLETED: "agent_assessment_completed",
  AGENT_ASSESSMENT_UPDATE_REQUESTED: "agent_assessment_update_requested",
  AGENT_PAYMENT_STATUS_CHANGED: "agent_payment_status_changed",
  // Stripe agent access payments (server-confirmed)
  AGENT_CHECKOUT_SESSION_CREATED: "agent_checkout_session_created",
  AGENT_PAYMENT_COMPLETED: "agent_payment_completed",
  AGENT_PAYMENT_FAILED: "agent_payment_failed",
  AGENT_PAYMENT_REFUNDED: "agent_payment_refunded",
  AGENT_PLATFORM_ACCESS_GRANTED: "agent_platform_access_granted",
  REVIEWER_COMPLIMENTARY_ACCESS_GRANTED: "reviewer_complimentary_access_granted",
  REVIEWER_COMPLIMENTARY_ACCESS_REVOKED: "reviewer_complimentary_access_revoked",
  // Reviewer / matching (server-confirmed)
  REVIEWER_MATCH_COMPLETED: "reviewer_match_completed",
  REVIEWER_MATCH_CHANGED: "reviewer_match_changed",
  REVIEWER_MATCH_REMOVED: "reviewer_match_removed",
  MATCH_EMAIL_SENT: "match_email_sent",
  // Auth (server-confirmed)
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  PASSWORD_RESET_FAILED: "password_reset_failed",
  // Reliability
  API_OPERATION_FAILED: "api_operation_failed",
} as const;

export type AnalyticsPropertyValue = string | number | boolean | null;

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function sanitizeProps(
  props: Record<string, unknown> | null | undefined
): Record<string, AnalyticsPropertyValue> {
  const out: Record<string, AnalyticsPropertyValue> = {};
  if (!props || typeof props !== "object") return out;
  let count = 0;
  for (const [key, raw] of Object.entries(props)) {
    if (count >= MAX_PROPS) break;
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") {
      continue; // reject nested objects/arrays
    }
    if (typeof raw === "number" && !Number.isFinite(raw)) continue;
    let value: AnalyticsPropertyValue = raw as AnalyticsPropertyValue;
    if (typeof value === "string") {
      value = value.slice(0, MAX_STRING);
      if (value === "") continue;
    }
    out[key] = value;
    count += 1;
  }
  return out;
}

/**
 * Fire a server-side custom event. Never throws; an analytics failure must
 * never turn a successful assessment, signup, or match into a 500.
 */
export async function trackServerEvent(
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    if (!EVENT_NAME_RE.test(eventName)) {
      if (isDev()) console.warn("[analytics] invalid event name:", eventName);
      return;
    }
    const data = sanitizeProps(properties);
    if (isDev()) console.log("[analytics]", eventName, data);
    await track(eventName, data);
  } catch (error) {
    // Safe error logging only in development; never rethrow.
    if (isDev()) {
      console.warn("[analytics] track failed:", error instanceof Error ? error.message : "unknown");
    }
  }
}

/**
 * Fire-and-forget variant for hot paths where awaiting is undesirable.
 * The promise is intentionally not returned; failures are swallowed.
 */
export function trackServerEventInBackground(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  void trackServerEvent(eventName, properties);
}

// --- Shared safe formatters ------------------------------------------------

/** Lowercase slug for a market/city so events group cleanly (e.g. "dallas"). */
export function marketSlug(city: string | null | undefined): string | null {
  const v = (city ?? "").trim().toLowerCase();
  if (!v) return null;
  return v.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || null;
}

/** Band a distance in miles into a coarse category (no raw coordinates). */
export function distanceBand(miles: number | null | undefined): string {
  if (miles === null || miles === undefined || !Number.isFinite(miles)) return "unavailable";
  if (miles <= 10) return "0_to_10";
  if (miles <= 25) return "11_to_25";
  if (miles <= 50) return "26_to_50";
  if (miles <= 75) return "51_to_75";
  return "over_75";
}

/** Band a fit score (0-100) into a coarse category. */
export function fitBand(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "unknown";
  if (score >= 85) return "top";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  return "limited";
}

/** Band a payment amount in cents (exact amounts are never sent). */
export function amountBand(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "unknown";
  if (cents === 0) return "zero";
  const dollars = cents / 100;
  if (dollars < 50) return "under_50";
  if (dollars < 100) return "50_to_99";
  if (dollars < 250) return "100_to_249";
  return "250_plus";
}

/** Hours between two timestamps, rounded to one decimal; null when unknown. */
export function hoursBetween(
  earlier: string | Date | null | undefined,
  later: string | Date | null | undefined
): number | null {
  try {
    if (!earlier || !later) return null;
    const a = new Date(earlier).getTime();
    const b = new Date(later).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    return Math.round(((b - a) / 3600000) * 10) / 10;
  } catch {
    return null;
  }
}
