import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { isMissingColumnError } from "./supabaseWrite.js";
import { setReviewerPaymentStatus } from "./payments.js";
import { AGENT_ACCESS_AMOUNT_CENTS, AGENT_ACCESS_CURRENCY, AGENT_ACCESS_PURPOSE } from "./stripe.js";
import { trackServerEventInBackground, ANALYTICS_EVENTS } from "./vercelAnalytics.js";
import type { AuthedProfile } from "./auth.js";

/**
 * Agent platform access: the SINGLE source of truth (migration 0018).
 *
 * The access state lives on public.agents. Platform access is allowed ONLY
 * when access_status is one of: grandfathered, paid, complimentary. Every
 * other status blocks the dashboard and protected agent APIs.
 *
 * Access transitions:
 *   - grandfathered: set once by migration 0018 for agents created before the
 *     fixed launch cutoff. Existing agents NEVER pay and never see the gate.
 *   - paid: set ONLY by the verified Stripe webhook (never by the browser or
 *     a success_url redirect).
 *   - complimentary: granted/revoked by reviewers, with an audit trail.
 *   - refunded / suspended: block access until a reviewer intervenes.
 *
 * Pre-migration safety: if the live database has not run migration 0018 yet
 * (access columns missing), every agent is treated as grandfathered so nothing
 * locks out or breaks. The gate only activates once the migration is applied.
 */

export const ACCESS_STATUSES = [
  "grandfathered",
  "assessment_required",
  "payment_required",
  "checkout_started",
  "payment_pending",
  "paid",
  "complimentary",
  "payment_failed",
  "refunded",
  "suspended",
] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

/** Statuses that allow full platform (dashboard + protected API) access. */
export const ACCESS_ALLOWED_STATUSES: readonly AccessStatus[] = [
  "grandfathered",
  "paid",
  "complimentary",
];

/** Statuses from which a NEW checkout may be started. */
const PAYABLE_STATUSES: readonly AccessStatus[] = [
  "assessment_required",
  "payment_required",
  "checkout_started",
  "payment_pending",
  "payment_failed",
];

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  grandfathered: "Grandfathered",
  assessment_required: "Assessment required",
  payment_required: "Payment required",
  checkout_started: "Checkout started",
  payment_pending: "Payment pending",
  paid: "Paid",
  complimentary: "Complimentary",
  payment_failed: "Payment failed",
  refunded: "Refunded",
  suspended: "Suspended",
};

export function isAccessStatus(value: unknown): value is AccessStatus {
  return typeof value === "string" && (ACCESS_STATUSES as readonly string[]).includes(value);
}

export function accessStatusLabel(value: unknown): string {
  return isAccessStatus(value) ? ACCESS_STATUS_LABELS[value] : "Unknown";
}

export type AgentAccessRecord = {
  agentId: string;
  accessStatus: AccessStatus;
  paymentRequired: boolean;
  accessGrantedAt: string | null;
  accessGrantReason: string | null;
  grandfatheredAt: string | null;
  complimentaryAccess: boolean;
  complimentaryAccessGrantedAt: string | null;
  complimentaryAccessNote: string | null;
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripePaymentStatus: string | null;
  stripePaidAt: string | null;
  stripeAmountPaid: number | null;
  stripeCurrency: string | null;
  /** Agent basics needed by callers (never sent to analytics). */
  email: string | null;
  displayName: string | null;
  archetype: string | null;
  archetypeCompletedAt: string | null;
  createdAt: string | null;
  /** True when migration 0018 has not been applied (columns missing). */
  legacySchema: boolean;
};

/** True only for the three allowed statuses. The one shared access check. */
export function canAgentAccessPlatform(
  agent: { accessStatus?: string | null; access_status?: string | null } | null | undefined
): boolean {
  const status = agent?.accessStatus ?? agent?.access_status ?? null;
  return isAccessStatus(status) && (ACCESS_ALLOWED_STATUSES as readonly string[]).includes(status);
}

function toAccessRecord(row: any, legacySchema = false): AgentAccessRecord {
  const rawStatus = row?.access_status;
  // Pre-migration rows have no access columns: treat as grandfathered so the
  // gate can never lock out live agents before migration 0018 is applied.
  const accessStatus: AccessStatus = legacySchema
    ? "grandfathered"
    : isAccessStatus(rawStatus)
      ? rawStatus
      : "assessment_required";
  return {
    agentId: row?.id ?? "",
    accessStatus,
    paymentRequired: legacySchema ? false : row?.payment_required !== false,
    accessGrantedAt: row?.access_granted_at ?? null,
    accessGrantReason: row?.access_grant_reason ?? null,
    grandfatheredAt: row?.grandfathered_at ?? null,
    complimentaryAccess: row?.complimentary_access === true,
    complimentaryAccessGrantedAt: row?.complimentary_access_granted_at ?? null,
    complimentaryAccessNote: row?.complimentary_access_note ?? null,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeCheckoutSessionId: row?.stripe_checkout_session_id ?? null,
    stripePaymentIntentId: row?.stripe_payment_intent_id ?? null,
    stripePaymentStatus: row?.stripe_payment_status ?? null,
    stripePaidAt: row?.stripe_paid_at ?? null,
    stripeAmountPaid: typeof row?.stripe_amount_paid === "number" ? row.stripe_amount_paid : null,
    stripeCurrency: row?.stripe_currency ?? null,
    email: row?.email ?? null,
    displayName: row?.display_name ?? null,
    archetype: row?.archetype ?? null,
    archetypeCompletedAt: row?.archetype_completed_at ?? null,
    createdAt: row?.created_at ?? null,
    legacySchema,
  };
}

/** Load the access record for one agent, resilient to a pre-0018 schema. */
export async function getAgentAccessRecord(agentId: string): Promise<AgentAccessRecord | null> {
  if (!agentId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) {
      // Should not happen with select *, but stay resilient anyway.
      return toAccessRecord({ id: agentId }, true);
    }
    throw new Error(`getAgentAccessRecord failed: ${error.message}`);
  }
  if (!data) return null;
  // Detect a pre-migration schema: select * returned no access_status key.
  const legacySchema = !Object.prototype.hasOwnProperty.call(data, "access_status");
  return toAccessRecord(data, legacySchema);
}

/** Load an access record by Stripe Checkout Session id (webhook fallback). */
export async function getAgentAccessByCheckoutSession(
  sessionId: string
): Promise<AgentAccessRecord | null> {
  if (!sessionId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) return null;
    throw new Error(`getAgentAccessByCheckoutSession failed: ${error.message}`);
  }
  return data ? toAccessRecord(data) : null;
}

// ---------------------------------------------------------------------------
// Onboarding state resolver
// ---------------------------------------------------------------------------

export type OnboardingState =
  | "complete_profile"
  | "complete_assessment"
  | "view_results"
  | "payment_required"
  | "payment_pending"
  | "access_granted"
  | "suspended";

/** Resolutions partner agents skip the agent assessment by design. */
export function isResolutionsAgentEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith("@resolutions.realtor");
}

/**
 * The one place that decides where an agent belongs in onboarding. Used by
 * the access-status API (which login, dashboard, results, and payment pages
 * all consult) so redirects can never become circular.
 */
export function getAgentOnboardingState(
  access: AgentAccessRecord | null | undefined
): OnboardingState {
  if (!access) return "complete_profile";
  if (canAgentAccessPlatform(access)) return "access_granted";
  if (access.accessStatus === "suspended" || access.accessStatus === "refunded") {
    return "suspended";
  }
  // Resolutions agents never take the assessment; their assessment step is
  // considered satisfied so they go straight to payment (never a redirect
  // loop between the assessment bypass and the payment gate).
  const hasAssessment =
    Boolean(access.archetype || access.archetypeCompletedAt) ||
    isResolutionsAgentEmail(access.email);
  if (!hasAssessment) return "complete_assessment";
  if (access.accessStatus === "payment_pending") return "payment_pending";
  // Assessment done, payment outstanding. "assessment_required" means the
  // agent finished the assessment but has not clicked Continue yet: show
  // results first, then payment. Resolutions agents have no results page,
  // so they go directly to payment.
  if (access.accessStatus === "assessment_required") {
    return isResolutionsAgentEmail(access.email) ? "payment_required" : "view_results";
  }
  return "payment_required";
}

// ---------------------------------------------------------------------------
// Server-side gate for protected agent API routes
// ---------------------------------------------------------------------------

/** Error carrying a 402 + stable code; runHandler serializes it safely. */
export class AgentAccessError extends Error {
  public status = 402;
  public code = "agent_access_payment_required";
  constructor(public accessStatus: AccessStatus) {
    super("Platform access requires the one-time REQUITY access payment.");
    this.name = "AgentAccessError";
  }
}

/**
 * Hard server-side gate used by every protected agent API route. Allows only
 * grandfathered / paid / complimentary. Admins (internal REQUITY team) bypass.
 * Throws a 402 with code "agent_access_payment_required" otherwise.
 */
export async function requireAgentPlatformAccess(profile: AuthedProfile): Promise<AgentAccessRecord | null> {
  if (profile.role === "admin") return null;
  if (!profile.agentId) return null; // route-level 404 handles a missing agent row
  const access = await getAgentAccessRecord(profile.agentId);
  if (!access) return null;
  if (canAgentAccessPlatform(access)) return access;
  throw new AgentAccessError(access.accessStatus);
}

// ---------------------------------------------------------------------------
// Access transitions
// ---------------------------------------------------------------------------

async function updateAgentAccess(
  agentId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("agents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", agentId);
  if (error) throw new Error(`updateAgentAccess failed: ${error.message}`);
}

/** Best-effort sync into the reviewer payment log (append-only history). */
async function syncReviewerPaymentLog(params: {
  agentId: string;
  status: "paid" | "waived" | "refunded" | "unpaid";
  amountCents?: number | null;
  note: string;
  updatedBy?: string | null;
}): Promise<void> {
  try {
    await setReviewerPaymentStatus({
      entityType: "agent",
      entityId: params.agentId,
      status: params.status,
      amountCents: params.amountCents ?? null,
      note: params.note,
      updatedBy: params.updatedBy ?? null,
    });
  } catch (error) {
    // The access state on agents is the source of truth; the reviewer log is
    // display history. Never fail the transition because the log write failed.
    console.error("[agentAccess] reviewer payment log sync failed:", error);
  }
}

/**
 * After the agent views their assessment results and clicks Continue, move
 * them from assessment_required to payment_required (idempotent; never touches
 * an agent whose access is already granted or finalized).
 */
export async function markAgentPaymentRequired(agentId: string): Promise<void> {
  const access = await getAgentAccessRecord(agentId);
  if (!access || access.legacySchema) return;
  if (access.accessStatus !== "assessment_required") return;
  await updateAgentAccess(agentId, { access_status: "payment_required", payment_required: true });
}

export type StripeGrantInput = {
  agentId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  customerId: string | null;
  amountTotal: number | null;
  currency: string | null;
  metadataPurpose: string | null;
  paymentMethodType?: string | null;
};

export type StripeGrantResult =
  | { granted: true; alreadyGranted: boolean; access: AgentAccessRecord }
  | { granted: false; reason: string };

/**
 * The ONE idempotent function that grants access from a verified Stripe
 * payment. Called only by the signature-verified webhook (never from the
 * browser, never from a success_url redirect).
 *
 * Verifies:
 *   - metadata purpose is agent_platform_access
 *   - the agent exists
 *   - amount/currency match the $50 USD fee when Stripe supplies them
 *
 * Idempotent: a repeated webhook delivery for an already-paid agent is a
 * no-op (no duplicate status rows, analytics, or emails).
 */
export async function grantAgentAccessFromStripe(
  input: StripeGrantInput
): Promise<StripeGrantResult> {
  if (input.metadataPurpose !== AGENT_ACCESS_PURPOSE) {
    return { granted: false, reason: "wrong_purpose" };
  }
  const access = await getAgentAccessRecord(input.agentId);
  if (!access) return { granted: false, reason: "agent_not_found" };

  // Verify the amount and currency when Stripe supplies them. A mismatched
  // product/price never grants platform access.
  if (input.amountTotal !== null && input.amountTotal !== AGENT_ACCESS_AMOUNT_CENTS) {
    return { granted: false, reason: "amount_mismatch" };
  }
  if (input.currency && input.currency.toLowerCase() !== AGENT_ACCESS_CURRENCY) {
    return { granted: false, reason: "currency_mismatch" };
  }

  // Idempotency: this exact payment already granted access.
  if (
    access.accessStatus === "paid" &&
    access.stripeCheckoutSessionId &&
    input.checkoutSessionId &&
    access.stripeCheckoutSessionId === input.checkoutSessionId
  ) {
    return { granted: true, alreadyGranted: true, access };
  }
  // Never downgrade or overwrite a grandfathered/complimentary agent's grant
  // reason; still record the Stripe payment facts.
  const alreadyAllowed = canAgentAccessPlatform(access);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    stripe_payment_status: "paid",
    stripe_paid_at: now,
    stripe_amount_paid: input.amountTotal ?? AGENT_ACCESS_AMOUNT_CENTS,
    stripe_currency: (input.currency ?? AGENT_ACCESS_CURRENCY).toLowerCase(),
    stripe_checkout_session_id: input.checkoutSessionId,
    stripe_payment_intent_id: input.paymentIntentId,
    ...(input.customerId ? { stripe_customer_id: input.customerId } : {}),
    payment_required: false,
  };
  if (!alreadyAllowed) {
    patch.access_status = "paid";
    patch.access_granted_at = now;
    patch.access_grant_reason = "stripe_payment";
  }
  await updateAgentAccess(input.agentId, patch);

  await syncReviewerPaymentLog({
    agentId: input.agentId,
    status: "paid",
    amountCents: input.amountTotal ?? AGENT_ACCESS_AMOUNT_CENTS,
    note: `Stripe platform access payment (${input.checkoutSessionId ?? "checkout"})`,
  });

  trackServerEventInBackground(ANALYTICS_EVENTS.AGENT_PAYMENT_COMPLETED, {
    amount: 50,
    currency: "usd",
    payment_method_type: input.paymentMethodType ?? "unknown",
    grant_type: "stripe",
  });
  trackServerEventInBackground(ANALYTICS_EVENTS.AGENT_PLATFORM_ACCESS_GRANTED, {
    grant_type: "stripe",
  });

  const updated = await getAgentAccessRecord(input.agentId);
  return { granted: true, alreadyGranted: false, access: updated ?? access };
}

/** Webhook: async payment failed. Never grants access. Idempotent. */
export async function markAgentPaymentFailed(agentId: string): Promise<void> {
  const access = await getAgentAccessRecord(agentId);
  if (!access || access.legacySchema) return;
  if (canAgentAccessPlatform(access)) return; // never revoke on a failed retry
  await updateAgentAccess(agentId, {
    access_status: "payment_failed",
    stripe_payment_status: "failed",
  });
  trackServerEventInBackground(ANALYTICS_EVENTS.AGENT_PAYMENT_FAILED, {
    amount: 50,
    currency: "usd",
  });
}

/** Webhook: checkout session expired without payment. Idempotent. */
export async function markAgentCheckoutExpired(agentId: string): Promise<void> {
  const access = await getAgentAccessRecord(agentId);
  if (!access || access.legacySchema) return;
  if (canAgentAccessPlatform(access)) return;
  if (access.accessStatus !== "checkout_started" && access.accessStatus !== "payment_pending") return;
  await updateAgentAccess(agentId, {
    access_status: "payment_required",
    stripe_payment_status: "expired",
  });
}

/**
 * Webhook: the $50 access payment was refunded. Default policy: block access
 * (status refunded) unless the agent is grandfathered or complimentary.
 * History is preserved; nothing is deleted.
 */
export async function markAgentPaymentRefunded(agentId: string): Promise<void> {
  const access = await getAgentAccessRecord(agentId);
  if (!access || access.legacySchema) return;
  const patch: Record<string, unknown> = { stripe_payment_status: "refunded" };
  // Grandfathered / complimentary agents keep access; only a stripe-paid
  // grant is withdrawn by a refund.
  if (access.accessStatus === "paid") {
    patch.access_status = "refunded";
    patch.payment_required = true;
  }
  await updateAgentAccess(agentId, patch);
  await syncReviewerPaymentLog({
    agentId,
    status: "refunded",
    amountCents: access.stripeAmountPaid,
    note: "Stripe platform access payment refunded",
  });
  trackServerEventInBackground(ANALYTICS_EVENTS.AGENT_PAYMENT_REFUNDED, {
    amount: 50,
    currency: "usd",
  });
}

/** Webhook: a charge dispute opened. Suspend access and flag for review. */
export async function markAgentPaymentDisputed(agentId: string): Promise<void> {
  const access = await getAgentAccessRecord(agentId);
  if (!access || access.legacySchema) return;
  // Grandfathered / complimentary agents are reviewer decisions; only suspend
  // access that exists purely because of the disputed Stripe payment.
  if (access.accessStatus === "grandfathered" || access.accessStatus === "complimentary") return;
  await updateAgentAccess(agentId, {
    access_status: "suspended",
    stripe_payment_status: "disputed",
  });
}

// ---------------------------------------------------------------------------
// Reviewer actions: complimentary access
// ---------------------------------------------------------------------------

export async function grantComplimentaryAccess(params: {
  agentId: string;
  reviewerProfileId: string;
  reason: string;
  note?: string | null;
}): Promise<AgentAccessRecord> {
  const access = await getAgentAccessRecord(params.agentId);
  if (!access) throw new Error("Agent not found.");
  if (access.legacySchema) {
    throw new Error("Run migration 0018_agent_platform_access_and_stripe.sql first.");
  }
  const now = new Date().toISOString();
  const noteParts = [params.reason.trim(), (params.note ?? "").trim()].filter(Boolean);
  await updateAgentAccess(params.agentId, {
    complimentary_access: true,
    access_status: "complimentary",
    payment_required: false,
    complimentary_access_granted_at: now,
    complimentary_access_granted_by: params.reviewerProfileId,
    complimentary_access_note: noteParts.join(" | ") || null,
    access_granted_at: now,
    access_granted_by: params.reviewerProfileId,
    access_grant_reason: "reviewer_complimentary",
  });
  await syncReviewerPaymentLog({
    agentId: params.agentId,
    status: "waived",
    note: `Complimentary access granted: ${noteParts.join(" | ") || "no reason recorded"}`,
    updatedBy: params.reviewerProfileId,
  });
  trackServerEventInBackground(ANALYTICS_EVENTS.REVIEWER_COMPLIMENTARY_ACCESS_GRANTED, {
    previous_status: access.accessStatus,
  });
  trackServerEventInBackground(ANALYTICS_EVENTS.AGENT_PLATFORM_ACCESS_GRANTED, {
    grant_type: "complimentary",
  });
  const updated = await getAgentAccessRecord(params.agentId);
  if (!updated) throw new Error("Agent not found after update.");
  return updated;
}

/**
 * Revoke complimentary access. A previously PAID agent is restored to paid; a
 * grandfathered agent is restored to grandfathered; otherwise payment becomes
 * required again and the dashboard is blocked.
 */
export async function revokeComplimentaryAccess(params: {
  agentId: string;
  reviewerProfileId: string;
}): Promise<AgentAccessRecord> {
  const access = await getAgentAccessRecord(params.agentId);
  if (!access) throw new Error("Agent not found.");
  if (access.legacySchema) {
    throw new Error("Run migration 0018_agent_platform_access_and_stripe.sql first.");
  }
  const now = new Date().toISOString();
  let restoredStatus: AccessStatus;
  let paymentRequired: boolean;
  let grantReason: string | null;
  if (access.stripePaymentStatus === "paid") {
    restoredStatus = "paid";
    paymentRequired = false;
    grantReason = "stripe_payment";
  } else if (access.grandfatheredAt) {
    restoredStatus = "grandfathered";
    paymentRequired = false;
    grantReason = "existing_agent_grandfathered";
  } else {
    restoredStatus = "payment_required";
    paymentRequired = true;
    grantReason = null;
  }
  await updateAgentAccess(params.agentId, {
    complimentary_access: false,
    access_status: restoredStatus,
    payment_required: paymentRequired,
    access_grant_reason: grantReason,
    complimentary_access_note:
      [
        access.complimentaryAccessNote,
        `Revoked ${now} by reviewer`,
      ]
        .filter(Boolean)
        .join(" | ") || null,
  });
  if (paymentRequired) {
    await syncReviewerPaymentLog({
      agentId: params.agentId,
      status: "unpaid",
      note: "Complimentary access revoked; payment required",
      updatedBy: params.reviewerProfileId,
    });
  }
  trackServerEventInBackground(ANALYTICS_EVENTS.REVIEWER_COMPLIMENTARY_ACCESS_REVOKED, {
    restored_status: restoredStatus,
  });
  const updated = await getAgentAccessRecord(params.agentId);
  if (!updated) throw new Error("Agent not found after update.");
  return updated;
}

/** Reviewer: explicitly require payment again (never for paid/grandfathered). */
export async function markPaymentRequiredByReviewer(params: {
  agentId: string;
  reviewerProfileId: string;
}): Promise<AgentAccessRecord> {
  const access = await getAgentAccessRecord(params.agentId);
  if (!access) throw new Error("Agent not found.");
  if (access.legacySchema) {
    throw new Error("Run migration 0018_agent_platform_access_and_stripe.sql first.");
  }
  if (access.stripePaymentStatus === "paid" && access.accessStatus === "paid") {
    throw new Error("This agent has a confirmed Stripe payment. Refund it in Stripe instead.");
  }
  if (access.accessStatus === "grandfathered") {
    throw new Error("Grandfathered agents are never required to pay.");
  }
  await updateAgentAccess(params.agentId, {
    complimentary_access: false,
    access_status: "payment_required",
    payment_required: true,
    access_grant_reason: null,
  });
  const updated = await getAgentAccessRecord(params.agentId);
  if (!updated) throw new Error("Agent not found after update.");
  return updated;
}

/** Record checkout start (called by the create-checkout-session route). */
export async function recordCheckoutStarted(params: {
  agentId: string;
  checkoutSessionId: string;
  customerId: string | null;
}): Promise<void> {
  const access = await getAgentAccessRecord(params.agentId);
  if (!access || access.legacySchema) return;
  if (!(PAYABLE_STATUSES as readonly string[]).includes(access.accessStatus)) return;
  await updateAgentAccess(params.agentId, {
    access_status: "checkout_started",
    payment_required: true,
    stripe_checkout_session_id: params.checkoutSessionId,
    ...(params.customerId ? { stripe_customer_id: params.customerId } : {}),
  });
}

/** True when a new Stripe Checkout may be started for this access record. */
export function isPayableStatus(status: AccessStatus): boolean {
  return (PAYABLE_STATUSES as readonly string[]).includes(status);
}

export type AgentAccessSummary = {
  accessStatus: AccessStatus | null;
  accessStatusLabel: string;
  grandfathered: boolean;
  complimentaryAccess: boolean;
  stripePaymentStatus: string | null;
  stripePaidAt: string | null;
  stripeAmountPaid: number | null;
  stripeCheckoutSessionId: string | null;
};

/**
 * Compact access summaries for many agents at once (reviewer payments tab).
 * Returns an empty map on a pre-0018 schema so the reviewer UI keeps working.
 */
export async function getAgentAccessSummaries(
  agentIds?: string[]
): Promise<Map<string, AgentAccessSummary>> {
  const out = new Map<string, AgentAccessSummary>();
  const supabase = getSupabaseAdmin();
  try {
    let query = supabase
      .from("agents")
      .select(
        "id, access_status, grandfathered_at, complimentary_access, stripe_payment_status, stripe_paid_at, stripe_amount_paid, stripe_checkout_session_id"
      )
      .limit(2000);
    if (agentIds && agentIds.length) query = query.in("id", agentIds);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const status: AccessStatus | null = isAccessStatus(row.access_status)
        ? (row.access_status as AccessStatus)
        : null;
      out.set(String(row.id), {
        accessStatus: status,
        accessStatusLabel: status ? ACCESS_STATUS_LABELS[status] : "Unknown",
        grandfathered: Boolean(row.grandfathered_at),
        complimentaryAccess: row.complimentary_access === true,
        stripePaymentStatus: row.stripe_payment_status ?? null,
        stripePaidAt: row.stripe_paid_at ?? null,
        stripeAmountPaid:
          typeof row.stripe_amount_paid === "number" ? row.stripe_amount_paid : null,
        stripeCheckoutSessionId: row.stripe_checkout_session_id ?? null,
      });
    }
  } catch (error) {
    if (!isMissingColumnError(error)) {
      console.error("[agentAccess] access summaries unavailable:", error);
    }
  }
  return out;
}
