import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { isMissingTableError } from "./supabaseWrite.js";
import { ACTIVE_MATCH_STATUSES, isArchivedRow, matchLaneLabel } from "./reviewerMatches.js";
import { trackServerEventInBackground, ANALYTICS_EVENTS, amountBand } from "./vercelAnalytics.js";

/**
 * Reviewer payment status tracking (migration 0012), AGENTS ONLY.
 *
 * Payment statuses live in `reviewer_payment_statuses`, an append-only log:
 * one row per update, and the CURRENT status of an entity is its newest row.
 * Agents are REQUITY's paying clients, so the application only reads and
 * writes rows with entity_type = 'agent'. Consumer buyers and sellers never
 * have a payment status. The table's wider entity_type check constraint is
 * kept for future flexibility only; nothing writes non-agent rows.
 *
 * Everything here is resilient to an un-migrated live DB: a missing table
 * degrades to "no payment data" instead of crashing the dashboards.
 */

export const PAYMENT_STATUSES = [
  "unpaid",
  "invoice_sent",
  "paid",
  "waived",
  "refunded",
  "not_required",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// The application tracks payments for agents ONLY (agents are REQUITY's
// paying clients). The DB constraint allows more types for future use, but
// the API and UI must never create or read non-agent payment rows.
export const PAYMENT_ENTITY_TYPES = ["agent"] as const;
export type PaymentEntityType = (typeof PAYMENT_ENTITY_TYPES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  invoice_sent: "Invoice sent",
  paid: "Paid",
  waived: "Waived",
  refunded: "Refunded",
  not_required: "Not required",
};

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isPaymentEntityType(value: unknown): value is PaymentEntityType {
  return typeof value === "string" && (PAYMENT_ENTITY_TYPES as readonly string[]).includes(value);
}

export function paymentStatusLabel(value: unknown): string {
  return isPaymentStatus(value) ? PAYMENT_STATUS_LABELS[value] : PAYMENT_STATUS_LABELS.unpaid;
}

export type PaymentStatusRecord = {
  id: string | null;
  entityType: PaymentEntityType;
  entityId: string;
  status: PaymentStatus;
  statusLabel: string;
  amountCents: number | null;
  currency: string | null;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

function toRecord(row: any): PaymentStatusRecord {
  const status: PaymentStatus = isPaymentStatus(row?.status) ? row.status : "unpaid";
  return {
    id: row?.id ?? null,
    entityType: "agent",
    entityId: row?.entity_id ?? "",
    status,
    statusLabel: PAYMENT_STATUS_LABELS[status],
    amountCents: typeof row?.amount_cents === "number" ? row.amount_cents : null,
    currency: row?.currency ?? null,
    note: row?.note ?? null,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? row?.created_at ?? null,
  };
}

/**
 * Append one AGENT payment status update. History is kept: nothing is
 * overwritten or deleted. Returns the new record. Throws on invalid input
 * (including any non-agent entity type); a missing table (un-migrated DB)
 * throws a clear error the API turns into a 500.
 */
export async function setReviewerPaymentStatus(params: {
  entityType: string;
  entityId: string;
  status: string;
  amountCents?: number | null;
  note?: string | null;
  updatedBy?: string | null;
}): Promise<PaymentStatusRecord> {
  if (params.entityType !== "agent") {
    throw new Error("Payment statuses are tracked for agents only.");
  }
  if (!isPaymentStatus(params.status)) {
    throw new Error(`Invalid status. Expected one of: ${PAYMENT_STATUSES.join(", ")}.`);
  }
  const entityId = (params.entityId ?? "").trim();
  if (!entityId) throw new Error("An agent id is required.");

  const supabase = getSupabaseAdmin();

  // Previous status for analytics only (best effort; failures are ignored).
  let previousStatus: string | null = null;
  try {
    const prev = await getAgentPaymentStatus(entityId);
    previousStatus = prev?.status ?? null;
  } catch {
    previousStatus = null;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("reviewer_payment_statuses")
    .insert({
      entity_type: "agent",
      entity_id: entityId,
      status: params.status,
      amount_cents: params.amountCents ?? null,
      note: params.note ?? null,
      updated_by: params.updatedBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "Payment tracking is not available yet. Run migration 0012_reviewer_payment_statuses.sql."
      );
    }
    throw new Error(`setReviewerPaymentStatus failed: ${error.message}`);
  }

  // Analytics: banded amount only (never the exact figure), no identities.
  trackServerEventInBackground(ANALYTICS_EVENTS.AGENT_PAYMENT_STATUS_CHANGED, {
    previous_status: previousStatus ?? "none",
    new_status: params.status,
    amount_band: amountBand(params.amountCents ?? null),
    payment_type: "referral",
    changed_by: "reviewer",
  });

  return toRecord(data);
}

/**
 * Latest AGENT payment status per agent, keyed by agent id. Only rows with
 * entity_type = 'agent' are read; any legacy non-agent rows are ignored.
 * Bounded to the requested ids when provided; otherwise loads the newest 2000
 * log rows (plenty for the reviewer dashboard). A missing table returns an
 * empty map so dashboards keep working on an un-migrated DB.
 */
export async function getLatestAgentPaymentStatuses(
  agentIds?: string[]
): Promise<Map<string, PaymentStatusRecord>> {
  const out = new Map<string, PaymentStatusRecord>();
  const supabase = getSupabaseAdmin();
  try {
    let query = supabase
      .from("reviewer_payment_statuses")
      .select("*")
      .eq("entity_type", "agent")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);
    if (agentIds && agentIds.length) {
      query = query.in("entity_id", agentIds);
    }
    const { data, error } = await query;
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const key = String(row.entity_id ?? "");
      // Rows are newest-first; the first row per agent is the current status.
      if (key && !out.has(key)) out.set(key, toRecord(row));
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[payments] latest agent payment statuses unavailable:", error);
    }
  }
  return out;
}

/** Latest payment status for ONE agent, or null when never set / no table. */
export async function getAgentPaymentStatus(
  agentId: string
): Promise<PaymentStatusRecord | null> {
  if (!agentId) return null;
  const map = await getLatestAgentPaymentStatuses([agentId]);
  return map.get(agentId) ?? null;
}

export type ReviewerPaymentRow = {
  entityType: "agent";
  entityId: string;
  name: string | null;
  email: string | null;
  typeLabel: "Agent";
  /** Active match summaries for this agent, when any exist. */
  relatedMatch: string | null;
  status: PaymentStatus;
  statusLabel: string;
  amountCents: number | null;
  note: string | null;
  updatedAt: string | null;
};

export type ReviewerPaymentsSummary = {
  unpaidAgents: number;
  paid: number;
  invoiceSent: number;
  /** Matches superseded (changed) in the last 7 days. */
  matchesChangedThisWeek: number;
};

export type ReviewerPaymentsResult = {
  records: ReviewerPaymentRow[];
  summary: ReviewerPaymentsSummary;
  /** False when migration 0012 has not been applied to the live DB yet. */
  paymentsTableAvailable: boolean;
};

/**
 * The reviewer Agent Payments tab payload: every non-archived agent with its
 * current payment status (agents never updated default to "unpaid") and a
 * summary of the agent's active matches. Consumer clients are never listed;
 * agents are REQUITY's paying clients. Server-side filters keep the payload
 * bounded; heavier filtering happens in the UI on this compact list.
 */
export async function listReviewerPayments(filter?: {
  status?: string | null;
  limit?: number;
}): Promise<ReviewerPaymentsResult> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(filter?.limit ?? 500, 1), 1000);
  const rows: ReviewerPaymentRow[] = [];

  // Detect table availability once so the UI can explain a pending migration.
  let paymentsTableAvailable = true;
  try {
    const { error } = await supabase
      .from("reviewer_payment_statuses")
      .select("id")
      .limit(1);
    if (error && isMissingTableError(error)) paymentsTableAvailable = false;
  } catch {
    paymentsTableAvailable = false;
  }

  const latest = await getLatestAgentPaymentStatuses();

  // Active match counts per agent, so each payment row can show what the
  // agent is currently matched on.
  const matchSummaryByAgent = new Map<string, string[]>();
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("agent_id, match_lane, status")
      .in("status", ACTIVE_MATCH_STATUSES as unknown as string[])
      .limit(2000);
    if (error) throw error;
    for (const m of (data ?? []) as any[]) {
      if (!m.agent_id) continue;
      const lanes = matchSummaryByAgent.get(m.agent_id) ?? [];
      lanes.push(matchLaneLabel(m.match_lane));
      matchSummaryByAgent.set(m.agent_id, lanes);
    }
  } catch (error) {
    console.error("[payments] active match summary unavailable:", error);
  }

  // --- Agents (REQUITY's paying clients; the only entities listed) ---------
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("id, display_name, email, archived_at, deleted_at")
      .order("display_name", { ascending: true })
      .limit(limit);
    if (error) throw error;
    for (const agent of (data ?? []) as any[]) {
      if (isArchivedRow(agent)) continue;
      const rec = latest.get(agent.id) ?? null;
      const lanes = matchSummaryByAgent.get(agent.id) ?? [];
      rows.push({
        entityType: "agent",
        entityId: agent.id,
        name: agent.display_name ?? null,
        email: agent.email ?? null,
        typeLabel: "Agent",
        relatedMatch: lanes.length
          ? `${lanes.length} active match${lanes.length === 1 ? "" : "es"} (${lanes.join(", ")})`
          : null,
        status: rec?.status ?? "unpaid",
        statusLabel: rec?.statusLabel ?? PAYMENT_STATUS_LABELS.unpaid,
        amountCents: rec?.amountCents ?? null,
        note: rec?.note ?? null,
        updatedAt: rec?.updatedAt ?? null,
      });
    }
  } catch (error) {
    console.error("[payments] agents list unavailable:", error);
  }

  // --- Summary counts (computed on the full list before filtering) ---------
  const summary: ReviewerPaymentsSummary = {
    unpaidAgents: rows.filter((r) => r.status === "unpaid" || r.status === "invoice_sent").length,
    paid: rows.filter((r) => r.status === "paid").length,
    invoiceSent: rows.filter((r) => r.status === "invoice_sent").length,
    matchesChangedThisWeek: 0,
  };
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("match_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("status", "superseded")
      .gte("superseded_at", weekAgo);
    if (!error && typeof count === "number") summary.matchesChangedThisWeek = count;
  } catch (error) {
    console.error("[payments] matches-changed count unavailable:", error);
  }

  // --- Server-side filters ---------------------------------------------------
  let filtered = rows;
  const wantStatus = (filter?.status ?? "").trim().toLowerCase();
  if (wantStatus && isPaymentStatus(wantStatus)) {
    filtered = filtered.filter((r) => r.status === wantStatus);
  }

  return { records: filtered, summary, paymentsTableAvailable };
}
