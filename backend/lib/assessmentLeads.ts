import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { createNotification } from "./messages.js";
import { getAgentIdBySlug } from "./agentSlug.js";

/**
 * Incomplete / partial assessment lead capture.
 *
 * A lead row is created the moment a client enters their contact info and starts
 * the assessment, so REQUITY reviewers can follow up even when the assessment is
 * never completed. If the client finishes, the same lead is converted to
 * `completed`. If they abandon, it stays incomplete for follow-up.
 *
 * All writes happen here via the service role (RLS denies browser writes).
 *
 * Privacy note: contact info is only captured AFTER the user intentionally
 * provides it on the contact step and begins the assessment.
 */

export type LeadSource = "qr" | "agent_link" | "reviewer";
export type LeadStatus =
  | "started"
  | "in_progress"
  | "completed"
  | "abandoned"
  | "followed_up";

export type AssessmentLeadRecord = {
  id: string;
  client_assessment_id: string | null;
  agent_id: string | null;
  reviewer_id: string | null;
  source: LeadSource;
  status: LeadStatus;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  contact_consent: boolean;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  answered_count: number;
  partial_answers: Record<string, unknown>;
  archetype: string | null;
  transaction_intent: string | null;
  transaction_intent_label: string | null;
  transaction_intent_other: string | null;
  market_city: string | null;
  buying_market_city: string | null;
  selling_market_city: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Optional, populated for reviewer reads: the attached agent's display name. */
  agent_name?: string | null;
};

const RECENT_LEAD_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h dedupe window.

/**
 * Feature flag: create a reviewer-facing notification when a lead starts.
 * Disabled by default, enable only once follow-up timing is configured.
 */
const ENABLE_LEAD_START_NOTIFICATION = false;

async function resolveAgentId(input: {
  agentId?: string | null;
  agentSlug?: string | null;
  agentToken?: string | null;
}): Promise<string | null> {
  // Resolution priority (Part 5): explicit id → branded slug → legacy token.
  if (input.agentId) return input.agentId;
  if (input.agentSlug) {
    const bySlug = await getAgentIdBySlug(input.agentSlug);
    if (bySlug) return bySlug;
  }
  if (!input.agentToken) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("public_assessment_token", input.agentToken)
    .maybeSingle();
  return data?.id ?? null;
}

// --- Start ----------------------------------------------------------------

export type UpsertAssessmentLeadStartInput = {
  source: LeadSource;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  agentId?: string | null;
  agentSlug?: string | null;
  agentToken?: string | null;
  reviewerId?: string | null;
  clientAssessmentId?: string | null;
  contactConsent?: boolean;
};

/**
 * Create (or reuse) an incomplete lead when the assessment begins.
 *
 * Dedupe order:
 *   1. by `client_assessment_id` when present;
 *   2. otherwise by email + source + agent/reviewer within the last 24h.
 * A completed lead is never reused/downgraded, a new lead is created instead.
 */
export async function upsertAssessmentLeadStart(
  input: UpsertAssessmentLeadStartInput
): Promise<AssessmentLeadRecord> {
  const supabase = getSupabaseAdmin();
  const agentId =
    input.source === "reviewer" ? null : await resolveAgentId(input);

  const existing = await findReusableLead({
    clientAssessmentId: input.clientAssessmentId ?? null,
    email: input.email ?? null,
    source: input.source,
    agentId,
    reviewerId: input.reviewerId ?? null,
  });

  if (existing) {
    const { data, error } = await supabase
      .from("assessment_leads")
      .update({
        // Fill in any contact details we did not have yet (never blank them).
        full_name: input.fullName ?? existing.full_name,
        email: input.email ?? existing.email,
        phone: input.phone ?? existing.phone,
        client_assessment_id:
          input.clientAssessmentId ?? existing.client_assessment_id,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`upsertAssessmentLeadStart (update) failed: ${error.message}`);
    return data as AssessmentLeadRecord;
  }

  const { data, error } = await supabase
    .from("assessment_leads")
    .insert({
      client_assessment_id: input.clientAssessmentId ?? null,
      agent_id: agentId,
      reviewer_id: input.reviewerId ?? null,
      source: input.source,
      status: "started",
      full_name: input.fullName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      contact_consent: input.contactConsent ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`upsertAssessmentLeadStart (insert) failed: ${error.message}`);

  if (ENABLE_LEAD_START_NOTIFICATION) {
    await notifyLeadStarted(data as AssessmentLeadRecord).catch(() => undefined);
  }

  return data as AssessmentLeadRecord;
}

async function findReusableLead(filter: {
  clientAssessmentId: string | null;
  email: string | null;
  source: LeadSource;
  agentId: string | null;
  reviewerId: string | null;
}): Promise<AssessmentLeadRecord | null> {
  const supabase = getSupabaseAdmin();

  if (filter.clientAssessmentId) {
    const { data } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("client_assessment_id", filter.clientAssessmentId)
      .neq("status", "completed")
      .maybeSingle();
    if (data) return data as AssessmentLeadRecord;
  }

  if (filter.email) {
    const since = new Date(Date.now() - RECENT_LEAD_WINDOW_MS).toISOString();
    let query = supabase
      .from("assessment_leads")
      .select("*")
      .eq("email", filter.email)
      .eq("source", filter.source)
      .neq("status", "completed")
      .gte("last_activity_at", since)
      .order("last_activity_at", { ascending: false })
      .limit(1);
    query = filter.agentId
      ? query.eq("agent_id", filter.agentId)
      : query.is("agent_id", null);
    if (filter.reviewerId) query = query.eq("reviewer_id", filter.reviewerId);

    const { data } = await query;
    if (data && data.length) return data[0] as AssessmentLeadRecord;
  }

  return null;
}

// --- Progress -------------------------------------------------------------

export type UpdateAssessmentLeadProgressInput = {
  leadId: string;
  answeredCount?: number;
  partialAnswers?: Record<string, unknown>;
  archetype?: string | null;
};

/**
 * Update progress as the client answers questions. Merges partial answers,
 * bumps `last_activity_at`, and moves the lead to `in_progress`. Never
 * downgrades a completed lead.
 */
export async function updateAssessmentLeadProgress(
  input: UpdateAssessmentLeadProgressInput
): Promise<AssessmentLeadRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data: lead } = await supabase
    .from("assessment_leads")
    .select("*")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return null;
  if ((lead as AssessmentLeadRecord).status === "completed") {
    return lead as AssessmentLeadRecord; // never overwrite completed.
  }

  const current = lead as AssessmentLeadRecord;
  const mergedAnswers = {
    ...(current.partial_answers ?? {}),
    ...(input.partialAnswers ?? {}),
  };
  const answeredCount = Math.max(
    current.answered_count ?? 0,
    input.answeredCount ?? Object.keys(mergedAnswers).length
  );

  const { data, error } = await supabase
    .from("assessment_leads")
    .update({
      status: answeredCount > 0 ? "in_progress" : current.status,
      answered_count: answeredCount,
      partial_answers: mergedAnswers,
      archetype: input.archetype ?? current.archetype,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", input.leadId)
    .select()
    .single();
  if (error) throw new Error(`updateAssessmentLeadProgress failed: ${error.message}`);
  return data as AssessmentLeadRecord;
}

// --- Complete -------------------------------------------------------------

export type CompleteAssessmentLeadInput = {
  leadId?: string | null;
  clientAssessmentId?: string | null;
  email?: string | null;
  source?: LeadSource | null;
  agentId?: string | null;
  archetype?: string | null;
  answeredCount?: number | null;
  /** Full answers captured at completion (durable store of the responses). */
  partialAnswers?: Record<string, unknown> | null;
  /** Transaction intent captured at submit (buying/selling/other). */
  transactionIntent?: string | null;
  transactionIntentLabel?: string | null;
  transactionIntentOther?: string | null;
  /** City/market the client wants to buy/sell in (metadata, not scored). */
  marketCity?: string | null;
  buyingMarketCity?: string | null;
  sellingMarketCity?: string | null;
};

/**
 * Convert a lead to `completed`. Resolves the lead by id, then by
 * client_assessment_id, then by recent email+source. Safe to call from the
 * client-assessment submit flow. Returns null when no matching lead is found.
 */
export async function completeAssessmentLead(
  input: CompleteAssessmentLeadInput
): Promise<AssessmentLeadRecord | null> {
  const supabase = getSupabaseAdmin();
  const lead = await resolveLeadForCompletion(input);
  if (!lead) return null;

  const mergedAnswers = input.partialAnswers
    ? { ...(lead.partial_answers ?? {}), ...input.partialAnswers }
    : undefined;

  const { data, error } = await supabase
    .from("assessment_leads")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      archetype: input.archetype ?? lead.archetype,
      client_assessment_id: input.clientAssessmentId ?? lead.client_assessment_id,
      answered_count: input.answeredCount ?? lead.answered_count,
      transaction_intent: input.transactionIntent ?? lead.transaction_intent ?? null,
      transaction_intent_label: input.transactionIntentLabel ?? lead.transaction_intent_label ?? null,
      transaction_intent_other: input.transactionIntentOther ?? lead.transaction_intent_other ?? null,
      market_city: input.marketCity ?? lead.market_city ?? null,
      buying_market_city: input.buyingMarketCity ?? lead.buying_market_city ?? null,
      selling_market_city: input.sellingMarketCity ?? lead.selling_market_city ?? null,
      ...(mergedAnswers ? { partial_answers: mergedAnswers } : {}),
    })
    .eq("id", lead.id)
    .select()
    .single();
  if (error) throw new Error(`completeAssessmentLead failed: ${error.message}`);
  return data as AssessmentLeadRecord;
}

async function resolveLeadForCompletion(
  input: CompleteAssessmentLeadInput
): Promise<AssessmentLeadRecord | null> {
  const supabase = getSupabaseAdmin();

  if (input.leadId) {
    const { data } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("id", input.leadId)
      .maybeSingle();
    if (data) return data as AssessmentLeadRecord;
  }

  if (input.clientAssessmentId) {
    const { data } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("client_assessment_id", input.clientAssessmentId)
      .maybeSingle();
    if (data) return data as AssessmentLeadRecord;
  }

  if (input.email && input.source) {
    const since = new Date(Date.now() - RECENT_LEAD_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("email", input.email)
      .eq("source", input.source)
      .gte("last_activity_at", since)
      .order("last_activity_at", { ascending: false })
      .limit(1);
    if (data && data.length) return data[0] as AssessmentLeadRecord;
  }

  return null;
}

// --- Classification helpers ----------------------------------------------

/** A lead's assessment is finished (submitted), it must never be treated as incomplete. */
export function leadHasCompletedAssessment(lead: {
  status?: string | null;
  completed_at?: string | null;
}): boolean {
  return Boolean(lead?.completed_at) || lead?.status === "completed";
}

/**
 * A lead belongs in "Incomplete Assessments" only when the assessment was
 * started but never submitted. Completed and abandoned leads are excluded.
 */
export function leadIsIncomplete(lead: {
  status?: string | null;
  completed_at?: string | null;
}): boolean {
  if (leadHasCompletedAssessment(lead)) return false;
  const status = lead?.status ?? "";
  return status === "started" || status === "in_progress" || status === "followed_up";
}

// --- Reviewer / agent reads ----------------------------------------------

export type ListReviewerLeadsFilters = {
  status?: LeadStatus | null;
  source?: LeadSource | null;
  search?: string | null;
  limit?: number | null;
};

/**
 * Leads for the reviewer dashboard. By default, not-completed leads are shown
 * first, ordered by most recent activity.
 */
export async function listReviewerAssessmentLeads(
  filters: ListReviewerLeadsFilters = {}
): Promise<AssessmentLeadRecord[]> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

  let query = supabase
    .from("assessment_leads")
    .select("*")
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.search) {
    const term = `%${filters.search.replace(/[%,]/g, "")}%`;
    query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listReviewerAssessmentLeads failed: ${error.message}`);

  const rows = (data ?? []) as AssessmentLeadRecord[];

  // Attach agent display names for the reviewer view (single lookup).
  const agentIds = Array.from(
    new Set(rows.map((r) => r.agent_id).filter((id): id is string => !!id))
  );
  if (agentIds.length) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, display_name")
      .in("id", agentIds);
    const nameById = new Map((agents ?? []).map((a: any) => [a.id, a.display_name]));
    rows.forEach((r) => {
      r.agent_name = r.agent_id ? nameById.get(r.agent_id) ?? null : null;
    });
  }

  // Not-completed first; preserves last_activity_at desc within each group.
  return rows.sort((a, b) => {
    const aDone = a.status === "completed" ? 1 : 0;
    const bDone = b.status === "completed" ? 1 : 0;
    return aDone - bDone;
  });
}

/** qr/agent_link leads attached to a single agent (their incomplete clients). */
export async function listAgentAssessmentLeads(
  agentId: string
): Promise<AssessmentLeadRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessment_leads")
    .select("*")
    .eq("agent_id", agentId)
    .in("source", ["qr", "agent_link"])
    .order("last_activity_at", { ascending: false });
  if (error) throw new Error(`listAgentAssessmentLeads failed: ${error.message}`);
  return (data ?? []) as AssessmentLeadRecord[];
}

// --- Follow-up status -----------------------------------------------------

export type UpdateLeadFollowUpInput = {
  leadId: string;
  status?: LeadStatus | null;
  notes?: string | null;
  reviewerId?: string | null;
};

const FOLLOW_UP_STATUSES: LeadStatus[] = [
  "started",
  "in_progress",
  "completed",
  "abandoned",
  "followed_up",
];

/** Reviewer/admin updates a lead's follow-up status and/or notes. */
export async function updateAssessmentLeadFollowUpStatus(
  input: UpdateLeadFollowUpInput
): Promise<AssessmentLeadRecord> {
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };

  if (input.status) {
    if (!FOLLOW_UP_STATUSES.includes(input.status)) {
      throw new Error(`Invalid lead status: ${input.status}`);
    }
    patch.status = input.status;
  }
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.reviewerId !== undefined) patch.reviewer_id = input.reviewerId;

  const { data, error } = await supabase
    .from("assessment_leads")
    .update(patch)
    .eq("id", input.leadId)
    .select()
    .single();
  if (error) throw new Error(`updateAssessmentLeadFollowUpStatus failed: ${error.message}`);
  return data as AssessmentLeadRecord;
}

// --- Permanent delete -----------------------------------------------------

/**
 * Permanently delete a reviewer-queue lead by id (service role).
 *
 * This is the destructive action behind the reviewer "Mark abandoned" →
 * "Delete permanently" flow. We only remove the `assessment_leads` row so the
 * lead disappears for good from the reviewer page. Linked `assessments` /
 * `clients` rows (and never agents/profiles) are intentionally left untouched
 * to avoid cascading into matching/assignment history.
 *
 * Throws when the id is missing/blank or the delete errors. When the id simply
 * does not exist we still resolve ok:true (idempotent, the goal is "it's gone").
 */
export async function deleteAssessmentLead(
  leadId: string
): Promise<{ ok: true; deletedId: string }> {
  const id = (leadId ?? "").trim();
  if (!id) throw new Error("deleteAssessmentLead: leadId is required");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("assessment_leads").delete().eq("id", id);
  if (error) throw new Error(`deleteAssessmentLead failed: ${error.message}`);

  return { ok: true, deletedId: id };
}

// --- Follow-up messaging foundation (disabled by default) -----------------

async function notifyLeadStarted(lead: AssessmentLeadRecord): Promise<void> {
  // Reviewer-facing system notification hook. Off by default.
  await createNotification({
    recipientProfileId: lead.reviewer_id ?? null,
    agentId: lead.agent_id ?? null,
    type: "system",
    title: "Incomplete assessment started",
    body: "A client started an assessment but has not completed it yet.",
  });
}

export type IncompleteFollowUpDraft = {
  enabled: boolean;
  to: string | null;
  subject: string;
  body: string;
};

/**
 * Placeholder for a future abandoned-lead follow-up email. DISABLED by default, 
 * returns a draft only and never sends. Do not enable until follow-up timing and
 * consent handling are explicitly configured.
 */
export function createIncompleteAssessmentFollowUpDraft(
  lead: AssessmentLeadRecord
): IncompleteFollowUpDraft {
  return {
    enabled: false,
    to: lead.email,
    subject: "Finish your REQUITY assessment",
    body: `Hi ${lead.full_name ?? "there"}, you started your REQUITY assessment but didn't finish. Pick up where you left off whenever you're ready.`,
  };
}

/**
 * Placeholder for sending the follow-up email. DISABLED by default; returns a
 * structured no-op so callers can wire it up later without behavior changes.
 */
export async function sendIncompleteAssessmentFollowUpEmail(
  _lead: AssessmentLeadRecord
): Promise<{ sent: boolean; disabled: boolean; reason?: string }> {
  return { sent: false, disabled: true, reason: "Follow-up emails are not enabled yet." };
}
