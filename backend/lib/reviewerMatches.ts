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
import { sendAndRecordReviewerMatchEmail } from "./emailEvents.js";

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

/** All clients currently awaiting reviewer matching, with ranked agent options. */
export async function listReviewerQueue(): Promise<ReviewerQueueItem[]> {
  const supabase = getSupabaseAdmin();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("*")
    .eq("source", "requity_reviewer")
    .eq("status", "reviewer_matching")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listReviewerQueue failed: ${error.message}`);

  const queue: ReviewerQueueItem[] = [];
  for (const client of clients ?? []) {
    const rankings = await rankAgentsForClient(client.id);
    queue.push({ client, rankings });
  }
  return queue;
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
  matchId: string
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

  let emailed = false;
  if (agent.email) {
    try {
      const { send } = await sendAndRecordReviewerMatchEmail(
        { email: agent.email, name: agent.display_name },
        { clientName: client.full_name, agentName: agent.display_name }
      );
      emailed = send.sent;
    } catch (error) {
      console.error("[reviewerMatches] email failed:", error);
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

  const { notified, emailed } = await finalizeAssignment(client, agent, match.id);
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

  const { notified, emailed } = await finalizeAssignment(client, agent, matchId);
  return { matchId, clientId: client.id, agentId: agent.id, notified, emailed };
}
