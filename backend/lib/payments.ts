import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { isMissingTableError } from "./supabaseWrite.js";
import { ACTIVE_MATCH_STATUSES, isArchivedRow, matchLaneLabel } from "./reviewerMatches.js";

/**
 * Reviewer payment status tracking (migration 0012).
 *
 * Payment statuses live in `reviewer_payment_statuses`, an append-only log:
 * one row per update, and the CURRENT status of an entity is its newest row.
 * Both agents and consumer clients are tracked (agents are also REQUITY
 * clients), plus lead-backed clients and individual matches when needed.
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

export const PAYMENT_ENTITY_TYPES = ["agent", "client", "lead", "match"] as const;
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
    entityType: row?.entity_type ?? "client",
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
 * Append one payment status update. History is kept: nothing is overwritten
 * or deleted. Returns the new record. Throws on invalid input; a missing
 * table (un-migrated DB) throws a clear error the API turns into a 500.
 */
export async function setReviewerPaymentStatus(params: {
  entityType: string;
  entityId: string;
  status: string;
  amountCents?: number | null;
  note?: string | null;
  updatedBy?: string | null;
}): Promise<PaymentStatusRecord> {
  if (!isPaymentEntityType(params.entityType)) {
    throw new Error(`Invalid entityType. Expected one of: ${PAYMENT_ENTITY_TYPES.join(", ")}.`);
  }
  if (!isPaymentStatus(params.status)) {
    throw new Error(`Invalid status. Expected one of: ${PAYMENT_STATUSES.join(", ")}.`);
  }
  const entityId = (params.entityId ?? "").trim();
  if (!entityId) throw new Error("An entityId is required.");

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("reviewer_payment_statuses")
    .insert({
      entity_type: params.entityType,
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
  return toRecord(data);
}

/**
 * Latest payment status per entity, keyed `<entityType>:<entityId>`.
 * Bounded to the requested ids when provided; otherwise loads the newest 2000
 * log rows (plenty for the reviewer dashboard). A missing table returns an
 * empty map so dashboards keep working on an un-migrated DB.
 */
export async function getLatestPaymentStatuses(filter?: {
  entityType?: PaymentEntityType;
  entityIds?: string[];
}): Promise<Map<string, PaymentStatusRecord>> {
  const out = new Map<string, PaymentStatusRecord>();
  const supabase = getSupabaseAdmin();
  try {
    let query = supabase
      .from("reviewer_payment_statuses")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);
    if (filter?.entityType) query = query.eq("entity_type", filter.entityType);
    if (filter?.entityIds && filter.entityIds.length) {
      query = query.in("entity_id", filter.entityIds);
    }
    const { data, error } = await query;
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      const key = `${row.entity_type}:${row.entity_id}`;
      // Rows are newest-first; the first row per entity is the current status.
      if (!out.has(key)) out.set(key, toRecord(row));
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[payments] latest payment statuses unavailable:", error);
    }
  }
  return out;
}

/** Latest payment status for ONE entity, or null when never set / no table. */
export async function getPaymentStatusForEntity(
  entityType: PaymentEntityType,
  entityId: string
): Promise<PaymentStatusRecord | null> {
  if (!entityId) return null;
  const map = await getLatestPaymentStatuses({ entityType, entityIds: [entityId] });
  return map.get(`${entityType}:${entityId}`) ?? null;
}

export type ReviewerPaymentRow = {
  entityType: PaymentEntityType;
  entityId: string;
  name: string | null;
  email: string | null;
  /** "Agent" or "Client" for the payments table Type column. */
  typeLabel: string;
  /** Related active match summary when one exists (client rows). */
  relatedMatch: string | null;
  status: PaymentStatus;
  statusLabel: string;
  amountCents: number | null;
  note: string | null;
  updatedAt: string | null;
};

export type ReviewerPaymentsSummary = {
  unpaidAgents: number;
  unpaidClients: number;
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
 * The reviewer Payments tab payload: every non-archived agent plus every
 * client/lead holding an active match, each with its current payment status
 * (entities never updated default to "unpaid"). Server-side filters keep the
 * payload bounded; heavier filtering happens in the UI on this compact list.
 */
export async function listReviewerPayments(filter?: {
  status?: string | null;
  entityType?: string | null;
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

  const latest = await getLatestPaymentStatuses();
  const statusFor = (entityType: PaymentEntityType, entityId: string): PaymentStatusRecord | null =>
    latest.get(`${entityType}:${entityId}`) ?? null;

  // --- Agents (agents are also REQUITY clients; always listed) -------------
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("id, display_name, email, archived_at, deleted_at")
      .order("display_name", { ascending: true })
      .limit(limit);
    if (error) throw error;
    for (const agent of (data ?? []) as any[]) {
      if (isArchivedRow(agent)) continue;
      const rec = statusFor("agent", agent.id);
      rows.push({
        entityType: "agent",
        entityId: agent.id,
        name: agent.display_name ?? null,
        email: agent.email ?? null,
        typeLabel: "Agent",
        relatedMatch: null,
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

  // --- Consumer clients with an active match (paired clients) --------------
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("id, client_id, lead_id, match_lane, status, clients(id, full_name, email, archived_at, deleted_at), agents(display_name, archived_at, deleted_at)")
      .in("status", ACTIVE_MATCH_STATUSES as unknown as string[])
      .limit(limit);
    if (error) throw error;

    // Lead-backed matches need contact fields from assessment_leads.
    const matchRows = (data ?? []) as any[];
    const leadIds = Array.from(
      new Set(matchRows.filter((r) => !r.clients && r.lead_id).map((r) => r.lead_id))
    ) as string[];
    const leadById = new Map<string, any>();
    if (leadIds.length) {
      const { data: leadRows } = await supabase
        .from("assessment_leads")
        .select("id, full_name, email, archived_at, deleted_at")
        .in("id", leadIds);
      for (const l of (leadRows ?? []) as any[]) leadById.set(l.id, l);
    }

    const seen = new Set<string>();
    for (const m of matchRows) {
      const lead = !m.clients && m.lead_id ? leadById.get(m.lead_id) ?? null : null;
      const party = m.clients ?? lead;
      if (!party || isArchivedRow(party)) continue;
      const entityType: PaymentEntityType = m.clients ? "client" : "lead";
      const entityId = m.clients?.id ?? m.lead_id;
      if (!entityId) continue;
      const agentName = (m.agents as any)?.display_name ?? null;
      const laneLabel = matchLaneLabel(m.match_lane);
      const related = agentName ? `${laneLabel} match with ${agentName}` : `${laneLabel} match`;
      const key = `${entityType}:${entityId}`;
      if (seen.has(key)) {
        // A both-client with two lane matches: append the second lane summary.
        const existing = rows.find((r) => r.entityType === entityType && r.entityId === entityId);
        if (existing && existing.relatedMatch && !existing.relatedMatch.includes(related)) {
          existing.relatedMatch = `${existing.relatedMatch}; ${related}`;
        }
        continue;
      }
      seen.add(key);
      const rec = statusFor(entityType, entityId);
      rows.push({
        entityType,
        entityId,
        name: party.full_name ?? null,
        email: party.email ?? null,
        typeLabel: "Client",
        relatedMatch: related,
        status: rec?.status ?? "unpaid",
        statusLabel: rec?.statusLabel ?? PAYMENT_STATUS_LABELS.unpaid,
        amountCents: rec?.amountCents ?? null,
        note: rec?.note ?? null,
        updatedAt: rec?.updatedAt ?? null,
      });
    }
  } catch (error) {
    console.error("[payments] paired clients list unavailable:", error);
  }

  // --- Summary counts (computed on the full list before filtering) ---------
  const summary: ReviewerPaymentsSummary = {
    unpaidAgents: rows.filter((r) => r.entityType === "agent" && (r.status === "unpaid" || r.status === "invoice_sent")).length,
    unpaidClients: rows.filter((r) => r.entityType !== "agent" && (r.status === "unpaid" || r.status === "invoice_sent")).length,
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
  const wantType = (filter?.entityType ?? "").trim().toLowerCase();
  if (wantType === "agent") filtered = filtered.filter((r) => r.entityType === "agent");
  else if (wantType === "client") filtered = filtered.filter((r) => r.entityType !== "agent");

  return { records: filtered, summary, paymentsTableAvailable };
}
