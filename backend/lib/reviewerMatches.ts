import { getSupabaseAdmin } from "./supabaseAdmin.js";
import {
  rankAgentsForClient as rankProfiles,
  labelForScore,
  type AgentProfile,
  type ClientProfile,
  type MatchResult,
} from "./matching.js";
import {
  createNotification,
  REVIEWER_MATCH_NOTIFICATION_BODY,
} from "./messages.js";
import { sendClientMatchedEmail, type EmailTarget } from "./email.js";
import { env } from "./env.js";
import { assignArchetype, isApprovedClientArchetype } from "./archetypes.js";

/**
 * REQUITY reviewer queue: rank agents for a reviewer-sourced client, record a
 * recommendation, and on approval assign the client + notify/email the agent.
 *
 * Only `source = 'requity_reviewer'` clients flow through here. QR clients are
 * handled entirely inside clientAssessments.ts and never reach this queue.
 */

function toClientProfile(row: any): ClientProfile {
  return {
    id: row.id,
    name: row.full_name,
    archetype: row.archetype ?? "The Supporter",
    orientation: row.orientation ?? "Collaborator",
    style: row.style ?? "Practical",
    stressResponse: row.stress_response ?? "Freeze",
    source: row.source ?? "requity_reviewer",
  };
}

function toAgentProfile(row: any): AgentProfile {
  // Dimensions resolve scalar-column-first (highest fidelity when present),
  // then the `assessment_summary` JSON snapshot (used when the live schema does
  // not have the scalar dimension columns), then a safe default.
  const summary = (row.assessment_summary ?? {}) as Record<string, string>;
  return {
    id: row.id,
    name: row.display_name,
    archetype: row.archetype ?? summary.archetype ?? "The Collaborator",
    interactionStyle: row.interaction_style ?? summary.interactionStyle ?? "Facilitator",
    focus: row.focus ?? summary.focus ?? "Pragmatic",
    stressResponse: row.stress_response ?? summary.stressResponse ?? "Freeze",
    perceivedValue: row.perceived_value ?? summary.perceivedValue ?? "Trust",
    negotiationStyle: row.negotiation_style ?? summary.negotiationStyle ?? "Collaborative",
  };
}

export type RankedAgent = MatchResult & { agentRow: any };

/** Rank all available agents for a reviewer-queue client by id. */
export async function rankAgentsForClient(clientId: string): Promise<RankedAgent[]> {
  const supabase = getSupabaseAdmin();

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (clientError) throw new Error(`rankAgentsForClient client failed: ${clientError.message}`);

  const { data: agentRows, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .not("archetype", "is", null);
  if (agentError) throw new Error(`rankAgentsForClient agents failed: ${agentError.message}`);

  const client = toClientProfile(clientRow);
  const ranked = rankProfiles(client, (agentRows ?? []).map(toAgentProfile));

  return ranked.map((match) => ({
    ...match,
    agentRow: (agentRows ?? []).find((a) => a.id === match.agent.id),
  }));
}

export type CreateReviewerClientMatchParams = {
  clientId: string;
  agentId: string;
  score: number;
  reason?: string;
  reviewerId?: string | null;
  label?: string;
};

/** Record a pending reviewer recommendation pairing a client with an agent. */
export async function createReviewerClientMatch(params: CreateReviewerClientMatchParams) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("match_recommendations")
    .insert({
      client_id: params.clientId,
      agent_id: params.agentId,
      score: params.score,
      label: params.label ?? labelForScore(params.score),
      reason: params.reason ?? null,
      status: "pending",
      reviewer_id: params.reviewerId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`createReviewerClientMatch failed: ${error.message}`);
  return data;
}

export type ReviewerQueueItem = {
  client: any;
  rankings: RankedAgent[];
};

/**
 * All clients currently awaiting reviewer matching ("Up for review"), with
 * ranked agent options.
 *
 * Primary source is `public.clients` (source = requity_reviewer, status =
 * reviewer_matching). As a resilience layer we ALSO surface completed
 * reviewer-sourced `assessment_leads` whose submission never made it into
 * `public.clients` (e.g. the optional clients insert failed at submit time), so
 * a live submission is never hidden. Lead-derived items are deduped against
 * existing client rows by email, restricted to approved client archetypes, and
 * never include abandoned/incomplete leads.
 */
export async function listReviewerQueue(): Promise<ReviewerQueueItem[]> {
  const supabase = getSupabaseAdmin();
  const queue: ReviewerQueueItem[] = [];
  const clientEmails = new Set<string>();

  // --- Primary: reviewer-sourced clients awaiting matching ----------------
  try {
    const { data: clients, error } = await supabase
      .from("clients")
      .select("*")
      .eq("source", "requity_reviewer")
      .eq("status", "reviewer_matching")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const client of clients ?? []) {
      const rankings = await rankAgentsForClient(client.id);
      queue.push({ client, rankings });
    }
  } catch (error) {
    // Missing/drifted clients table → fall through to the lead-based source.
    console.error("[reviewerMatches] clients queue unavailable:", error);
  }

  // --- Resilience: completed reviewer leads not represented in clients ----
  try {
    const leadItems = await leadOnlyQueueItems(clientEmails);
    for (const item of leadItems) queue.push(item);
  } catch (error) {
    // Never let the fallback break the primary queue.
    console.error("[reviewerMatches] lead-based queue fallback skipped:", error);
  }

  return queue;
}

/**
 * Build view-only queue items from completed reviewer `assessment_leads` whose
 * email does not correspond to any existing `clients` row. Dimensions are
 * recomputed from the stored answers; only approved client archetypes appear.
 */
async function leadOnlyQueueItems(_seed: Set<string>): Promise<ReviewerQueueItem[]> {
  const supabase = getSupabaseAdmin();

  const { data: leads, error } = await supabase
    .from("assessment_leads")
    .select("*")
    .eq("source", "reviewer")
    .eq("status", "completed")
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  if (!leads || !leads.length) return [];

  // Which of these emails already exist as a client row (any status)? Those are
  // already (or were) in the pipeline and must not be duplicated here.
  const emails = Array.from(
    new Set(leads.map((l: any) => (l.email ? String(l.email).toLowerCase() : null)).filter(Boolean))
  ) as string[];
  const existingClientEmails = new Set<string>();
  if (emails.length) {
    try {
      const { data: existing } = await supabase
        .from("clients")
        .select("email")
        .in("email", emails);
      (existing ?? []).forEach((c: any) => {
        if (c.email) existingClientEmails.add(String(c.email).toLowerCase());
      });
    } catch {
      // clients table missing → treat all leads as not-yet-represented.
    }
  }

  // Fetch rankable agents once for all lead-derived items.
  const { data: agentRows } = await supabase
    .from("agents")
    .select("*")
    .not("archetype", "is", null);
  const agentProfiles = (agentRows ?? []).map(toAgentProfile);

  const items: ReviewerQueueItem[] = [];
  for (const lead of leads as any[]) {
    const email = lead.email ? String(lead.email).toLowerCase() : null;
    // Without an email we cannot dedupe reliably; skip to avoid resurfacing
    // assessments that were already assigned.
    if (!email || existingClientEmails.has(email)) continue;

    const scored = assignArchetype((lead.partial_answers as Record<string, string>) || {});
    const archetype = isApprovedClientArchetype(lead.archetype) ? lead.archetype : scored.archetype;
    if (!isApprovedClientArchetype(archetype)) continue;

    const profile: ClientProfile = {
      id: lead.id,
      name: lead.full_name,
      archetype,
      orientation: scored.orientation as ClientProfile["orientation"],
      style: scored.style as ClientProfile["style"],
      stressResponse: scored.stressResponse as ClientProfile["stressResponse"],
      source: "requity_reviewer",
    };
    const ranked = rankProfiles(profile, agentProfiles).map((match) => ({
      ...match,
      agentRow: (agentRows ?? []).find((a) => a.id === match.agent.id),
    }));

    items.push({
      client: {
        id: lead.id,
        full_name: lead.full_name,
        archetype,
        orientation: scored.orientation,
        style: scored.style,
        stress_response: scored.stressResponse,
        transaction_intent: lead.transaction_intent ?? null,
        transaction_intent_label: lead.transaction_intent_label ?? null,
        transaction_intent_other: lead.transaction_intent_other ?? null,
        market_city: lead.market_city ?? null,
        source: "requity_reviewer",
        status: "reviewer_matching",
      },
      rankings: ranked,
    });
  }
  return items;
}

export type ApproveReviewerMatchResult = {
  matchId: string;
  clientId: string;
  agentId: string;
  notified: boolean;
  emailed: boolean;
};

/**
 * Shared assignment side-effects: assign client -> agent, create the exact
 * reviewer-match notification, and send + record the Brevo email.
 */
async function finalizeAssignment(
  client: any,
  agent: any,
  matchId: string,
  matchLabel?: string | null
): Promise<{ notified: boolean; emailed: boolean }> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("clients")
    .update({ assigned_agent_id: agent.id, status: "assigned" })
    .eq("id", client.id);

  let notified = false;
  try {
    await createNotification({
      recipientProfileId: agent.profile_id ?? null,
      agentId: agent.id,
      clientId: client.id,
      type: "reviewer_match_received",
      title: "You've received a client match from REQUITY!",
      body: REVIEWER_MATCH_NOTIFICATION_BODY,
    });
    notified = true;
  } catch (error) {
    console.error("[reviewerMatches] notification failed:", error);
  }

  // Email the matched agent, plus the reviewer/admin fallback when configured
  // (and not a duplicate of the agent address). Dedupes by client+agent.
  const recipients: EmailTarget[] = [];
  if (agent.email) {
    recipients.push({ email: agent.email, name: agent.display_name, role: "agent" });
  }
  const reviewEmail = env.reviewNotificationEmail;
  if (
    reviewEmail &&
    (!agent.email || reviewEmail.toLowerCase() !== String(agent.email).toLowerCase())
  ) {
    recipients.push({ email: reviewEmail, role: "reviewer" });
  }

  let emailed = false;
  if (recipients.length) {
    try {
      const delivery = await sendClientMatchedEmail({
        eventKey: `client_matched:${client.id}:${agent.id}`,
        recipients,
        clientName: client.full_name ?? null,
        clientArchetype: client.archetype ?? null,
        agentName: agent.display_name ?? null,
        matchLabel: matchLabel ?? null,
        transactionIntentLabel: client.transaction_intent_label ?? null,
        marketCity: client.market_city ?? null,
      });
      emailed = delivery.emailed;
    } catch (error) {
      console.error("[reviewerMatches] email failed:", error instanceof Error ? error.message : error);
    }
  }

  return { notified, emailed };
}

export type AssignReviewerMatchParams = {
  clientId: string;
  agentId: string;
  score?: number;
  reason?: string;
  reviewerId?: string | null;
};

/**
 * Reviewer picks an agent for a queued client and approves in one step:
 * records the recommendation (assigned), assigns the client, notifies + emails.
 */
export async function assignReviewerMatch(
  params: AssignReviewerMatchParams
): Promise<ApproveReviewerMatchResult> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.clientId)
    .single();
  if (clientError) throw new Error(`assignReviewerMatch client failed: ${clientError.message}`);

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", params.agentId)
    .single();
  if (agentError) throw new Error(`assignReviewerMatch agent failed: ${agentError.message}`);

  const score = params.score ?? 0;
  const { data: match, error: matchError } = await supabase
    .from("match_recommendations")
    .insert({
      client_id: client.id,
      agent_id: agent.id,
      score,
      label: labelForScore(score),
      reason: params.reason ?? null,
      status: "assigned",
      reviewer_id: params.reviewerId ?? null,
      reviewed_at: now,
    })
    .select("id")
    .single();
  if (matchError) throw new Error(`assignReviewerMatch recommendation failed: ${matchError.message}`);

  const { notified, emailed } = await finalizeAssignment(client, agent, match.id, labelForScore(score));
  return { matchId: match.id, clientId: client.id, agentId: agent.id, notified, emailed };
}

/**
 * Approve a reviewer recommendation:
 *  1. mark the recommendation approved/assigned
 *  2. assign the client to the agent (badge: "REQUITY Client Match")
 *  3. create the in-app reviewer-match notification (exact REQUITY copy)
 *  4. send + record the Brevo reviewer match email to the agent
 */
export async function approveReviewerMatch(
  matchId: string,
  reviewerId?: string | null
): Promise<ApproveReviewerMatchResult> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: match, error: matchError } = await supabase
    .from("match_recommendations")
    .select("*, clients(*), agents(*)")
    .eq("id", matchId)
    .single();
  if (matchError) throw new Error(`approveReviewerMatch lookup failed: ${matchError.message}`);

  const client = (match as any).clients;
  const agent = (match as any).agents;

  await supabase
    .from("match_recommendations")
    .update({ status: "assigned", reviewed_at: now, reviewer_id: reviewerId ?? match.reviewer_id })
    .eq("id", matchId);

  const { notified, emailed } = await finalizeAssignment(
    client,
    agent,
    matchId,
    (match as any).label ?? labelForScore((match as any).score ?? 0)
  );
  return { matchId, clientId: client.id, agentId: agent.id, notified, emailed };
}
