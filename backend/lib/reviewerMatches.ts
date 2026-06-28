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
import { attachClientReport } from "./clientReport.js";
import {
  derivePipelineStatus,
  pipelineStatusLabel,
  type PipelineStatus,
} from "./dashboard.js";
import {
  geocode,
  scoreLocationFit,
  combineMatchScore,
  buildLocationMatchReason,
  normalizeCityState,
  normalizeState,
  type LocationParty,
  type LocationScoreResult,
} from "./location.js";

/**
 * Reviewer-facing pipeline status for a client/lead row. Never returns "hidden"
 * here: a paired/queued row always shows a real status, defaulting to potential.
 */
function reviewerPipelineStatus(row: any): PipelineStatus {
  const derived = derivePipelineStatus(row);
  return derived === "hidden" ? "potential" : derived;
}

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

export type RankedAgent = MatchResult & {
  agentRow: any;
  /** Location/proximity component (0-100). */
  locationScore: number;
  /** Distance in miles to the client market, when both have coordinates. */
  distanceMiles: number | null;
  /** Blended total (70% compatibility, 25% location, 5% availability). */
  totalScore: number;
  /** Reviewer-facing one-line explanation of the match. */
  matchReason: string;
  /** True when the client market is outside the agent's service radius. */
  outsideRadius: boolean;
};

// --- Location-aware ranking -------------------------------------------------

/** Build a LocationParty from a row's coordinates, geocoding (cache) if absent. */
async function marketParty(
  city: string | null | undefined,
  state: string | null | undefined,
  lat: number | null | undefined,
  lon: number | null | undefined,
  memo: Map<string, LocationParty>
): Promise<LocationParty | null> {
  const normalized = normalizeCityState(city, state);
  if (lat != null && lon != null) {
    return { city: city ?? null, state: state ?? null, normalized, latitude: lat, longitude: lon };
  }
  if (!normalized) return null;
  if (memo.has(normalized)) return memo.get(normalized)!;
  const geo = await geocode(city, state);
  const party: LocationParty = {
    city: geo.city,
    state: geo.state,
    normalized: geo.normalized || normalized,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
  memo.set(normalized, party);
  return party;
}

/** The client market(s) relevant to scoring, chosen by transaction intent. */
async function clientMarketParties(row: any, memo: Map<string, LocationParty>): Promise<LocationParty[]> {
  const intent = row.transaction_intent ?? null;
  const out: LocationParty[] = [];
  const buy = await marketParty(row.buying_market_city, row.buying_market_state, row.buying_latitude, row.buying_longitude, memo);
  const sell = await marketParty(row.selling_market_city, row.selling_market_state, row.selling_latitude, row.selling_longitude, memo);
  const fallback = await marketParty(row.market_city, row.market_state, row.latitude, row.longitude, memo);
  if (intent === "buying" && buy) out.push(buy);
  else if (intent === "selling" && sell) out.push(sell);
  else if (intent === "both") {
    if (buy) out.push(buy);
    if (sell) out.push(sell);
  } else if (fallback) out.push(fallback);
  // Last-resort fallback so we never lose a client with only one market filled.
  if (!out.length) {
    for (const p of [buy, sell, fallback]) if (p) { out.push(p); break; }
  }
  return out;
}

/**
 * Score a client's market(s) against an agent. For "Buying and Selling" we use
 * the LOWER of the two location scores so a top match requires BOTH markets to
 * be within reach (one side outside the radius lowers the overall fit).
 */
function clientAgentLocation(markets: LocationParty[], agent: LocationParty, radius: number | null): LocationScoreResult {
  if (!markets.length) return scoreLocationFit({}, agent, radius);
  let chosen = scoreLocationFit(markets[0], agent, radius);
  for (let i = 1; i < markets.length; i++) {
    const s = scoreLocationFit(markets[i], agent, radius);
    if (s.score < chosen.score) chosen = s;
  }
  return chosen;
}

/**
 * Location-aware ranking of agent rows for a client/lead row. Personality
 * compatibility is computed first (never replaced); location + availability
 * re-rank agents whose compatibility is similar. Sorted: inside-radius first,
 * then blended total desc, then location score desc.
 */
export async function rankAgentsForClientLocationAware(
  clientRow: any,
  agentRows: any[]
): Promise<RankedAgent[]> {
  const client = toClientProfile(clientRow);
  const personalityRanked = rankProfiles(client, (agentRows ?? []).map(toAgentProfile));
  const memo = new Map<string, LocationParty>();
  const markets = await clientMarketParties(clientRow, memo);

  const enriched: RankedAgent[] = [];
  for (const match of personalityRanked) {
    const agentRow = (agentRows ?? []).find((a) => a.id === match.agent.id);
    const radius =
      agentRow && typeof agentRow.service_radius_miles === "number" ? agentRow.service_radius_miles : null;
    const agentParty =
      (await marketParty(
        agentRow?.market_city,
        agentRow?.market_state,
        agentRow?.latitude,
        agentRow?.longitude,
        memo
      )) ?? {};
    const loc = clientAgentLocation(markets, agentParty, radius);
    const totalScore = combineMatchScore(match.score, loc.score, 100);
    const matchReason = buildLocationMatchReason(match.score, loc);
    console.log("MATCH_LOCATION_SCORE_CALCULATED", {
      hasClientMarket: markets.length > 0,
      locationScore: loc.score,
      distanceMiles: loc.distanceMiles,
      outsideRadius: loc.outsideRadius,
    });
    enriched.push({
      ...match,
      agentRow,
      locationScore: loc.score,
      distanceMiles: loc.distanceMiles,
      totalScore,
      matchReason,
      outsideRadius: loc.outsideRadius,
    });
  }

  enriched.sort((a, b) => {
    if (a.outsideRadius !== b.outsideRadius) return a.outsideRadius ? 1 : -1;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return b.locationScore - a.locationScore;
  });
  return enriched;
}

/** Rank all available agents for a reviewer-queue client by id (location-aware). */
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

  return rankAgentsForClientLocationAware(clientRow, agentRows ?? []);
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
      const enriched = attachClientReport(client) as any;
      enriched.rowKind = "client";
      enriched.pipelineStatus = reviewerPipelineStatus(client);
      enriched.pipelineLabel = pipelineStatusLabel(enriched.pipelineStatus);
      queue.push({ client: enriched, rankings });
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

  const items: ReviewerQueueItem[] = [];
  for (const lead of leads as any[]) {
    const email = lead.email ? String(lead.email).toLowerCase() : null;
    // Without an email we cannot dedupe reliably; skip to avoid resurfacing
    // assessments that were already assigned.
    if (!email || existingClientEmails.has(email)) continue;

    const scored = assignArchetype((lead.partial_answers as Record<string, string>) || {});
    const archetype = isApprovedClientArchetype(lead.archetype) ? lead.archetype : scored.archetype;
    if (!isApprovedClientArchetype(archetype)) continue;

    // Merge the recomputed dimensions onto the raw lead row so the
    // location-aware ranker can read both the scored dimensions and the lead's
    // structured location columns (buying/selling state + coordinates).
    const rankRow = {
      ...lead,
      archetype,
      orientation: scored.orientation,
      style: scored.style,
      stress_response: scored.stressResponse,
      source: "requity_reviewer",
    };
    const ranked = await rankAgentsForClientLocationAware(rankRow, agentRows ?? []);

    const leadClient = attachClientReport({
      id: lead.id,
      full_name: lead.full_name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      archetype,
      orientation: scored.orientation,
      style: scored.style,
      stress_response: scored.stressResponse,
      transaction_intent: lead.transaction_intent ?? null,
      transaction_intent_label: lead.transaction_intent_label ?? null,
      transaction_intent_other: lead.transaction_intent_other ?? null,
      market_city: lead.market_city ?? null,
      buying_market_city: lead.buying_market_city ?? null,
      selling_market_city: lead.selling_market_city ?? null,
      pipeline_status: lead.pipeline_status ?? null,
      source: "requity_reviewer",
      status: "reviewer_matching",
    }) as any;
    // This queue row is backed by an assessment_leads row, not a clients row, so
    // the reviewer status update must target leadId (rowKind = "lead").
    leadClient.rowKind = "lead";
    leadClient.pipelineStatus = reviewerPipelineStatus({ pipeline_status: lead.pipeline_status });
    leadClient.pipelineLabel = pipelineStatusLabel(leadClient.pipelineStatus);
    items.push({ client: leadClient, rankings: ranked });
  }
  return items;
}

export type PairedClientItem = {
  matchId: string | null;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientArchetype: string | null;
  transactionIntent: string | null;
  transactionIntentLabel: string | null;
  buyingMarket: string | null;
  sellingMarket: string | null;
  market: string | null;
  agentId: string | null;
  agentName: string | null;
  agentEmail: string | null;
  agentArchetype: string | null;
  score: number | null;
  label: string | null;
  status: string;
  pipelineStatus: PipelineStatus;
  pipelineLabel: string;
  matchedAt: string | null;
};

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/**
 * Live "Paired Clients" for the reviewer page: clients that have been matched to
 * an agent. Primary source is `match_recommendations` rows with an
 * assigned/approved status (joined to `clients` + `agents`). Resilient: a
 * missing/drifted `match_recommendations` table degrades to a `clients`-only
 * pass (status = assigned with an assigned_agent_id). Never fabricates pairings;
 * returns [] when there are none. Deduped by client (newest pairing wins).
 */
export async function listPairedClients(): Promise<PairedClientItem[]> {
  const supabase = getSupabaseAdmin();
  const byClient = new Map<string, PairedClientItem>();
  const PAIRED_STATUSES = ["assigned", "approved"];

  const pushItem = (item: PairedClientItem) => {
    const key = item.clientId ?? item.matchId ?? `${item.clientName}:${item.agentId}`;
    if (key && !byClient.has(key)) byClient.set(key, item);
  };

  // --- Primary: match_recommendations joined to clients + agents ----------
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("*, clients(*), agents(*)")
      .in("status", PAIRED_STATUSES)
      .order("reviewed_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as any[]) {
      const client = row.clients ?? {};
      const agent = row.agents ?? {};
      pushItem({
        matchId: row.id ?? null,
        clientId: client.id ?? row.client_id ?? null,
        clientName: cleanText(client.full_name),
        clientEmail: cleanText(client.email),
        clientArchetype: cleanText(client.archetype),
        transactionIntent: cleanText(client.transaction_intent),
        transactionIntentLabel: cleanText(client.transaction_intent_label),
        buyingMarket: cleanText(client.buying_market_city),
        sellingMarket: cleanText(client.selling_market_city),
        market: cleanText(client.market_city),
        agentId: agent.id ?? row.agent_id ?? null,
        agentName: cleanText(agent.display_name),
        agentEmail: cleanText(agent.email),
        agentArchetype: cleanText(agent.archetype),
        score: typeof row.score === "number" ? row.score : null,
        label: cleanText(row.label),
        status: cleanText(row.status) ?? "assigned",
        pipelineStatus: reviewerPipelineStatus(client),
        pipelineLabel: pipelineStatusLabel(reviewerPipelineStatus(client)),
        matchedAt: row.reviewed_at ?? row.created_at ?? null,
      });
    }
  } catch (error) {
    console.error("[reviewerMatches] paired (match_recommendations) unavailable:", error);
  }

  // --- Resilience: assigned clients not already represented above ---------
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*, agents:assigned_agent_id(*)")
      .eq("status", "assigned")
      .not("assigned_agent_id", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const client of (data ?? []) as any[]) {
      if (client.id && byClient.has(client.id)) continue;
      const agent = client.agents ?? {};
      pushItem({
        matchId: null,
        clientId: client.id ?? null,
        clientName: cleanText(client.full_name),
        clientEmail: cleanText(client.email),
        clientArchetype: cleanText(client.archetype),
        transactionIntent: cleanText(client.transaction_intent),
        transactionIntentLabel: cleanText(client.transaction_intent_label),
        buyingMarket: cleanText(client.buying_market_city),
        sellingMarket: cleanText(client.selling_market_city),
        market: cleanText(client.market_city),
        agentId: agent.id ?? client.assigned_agent_id ?? null,
        agentName: cleanText(agent.display_name),
        agentEmail: cleanText(agent.email),
        agentArchetype: cleanText(agent.archetype),
        score: null,
        label: null,
        status: "assigned",
        pipelineStatus: reviewerPipelineStatus(client),
        pipelineLabel: pipelineStatusLabel(reviewerPipelineStatus(client)),
        matchedAt: client.updated_at ?? client.created_at ?? null,
      });
    }
  } catch (error) {
    console.error("[reviewerMatches] paired (clients fallback) unavailable:", error);
  }

  return Array.from(byClient.values());
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

// ============================================================================
// Location grouping + reviewer search (Parts 8-10)
// ============================================================================

export type ReviewerMarket = {
  city: string | null;
  state: string | null;
  normalized: string;
  label: string;
  clientCount: number;
  agentCount: number;
  unmatchedClientCount: number;
  pairedCount: number;
  closedCount: number;
};

export type ReviewerLocationClient = {
  id: string | null;
  rowKind: "client" | "lead";
  name: string | null;
  email: string | null;
  archetype: string | null;
  transactionIntent: string | null;
  transactionIntentLabel: string | null;
  market: string | null;
  marketNormalized: string | null;
  state: string | null;
  status: PipelineStatus;
  statusLabel: string;
  assigned: boolean;
  agentName: string | null;
};

export type ReviewerLocationAgent = {
  id: string | null;
  name: string | null;
  email: string | null;
  archetype: string | null;
  market: string | null;
  marketNormalized: string | null;
  state: string | null;
  serviceRadiusMiles: number | null;
};

export type ReviewerLocationsResult = {
  markets: ReviewerMarket[];
  clients: ReviewerLocationClient[];
  agents: ReviewerLocationAgent[];
  total: { marketCount: number; clientCount: number; agentCount: number };
};

export type ReviewerLocationFilters = {
  q?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  transaction?: string | null;
  limit?: number;
  offset?: number;
};

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** "miami, fl" → "Miami, FL"; "miami" → "Miami". */
function prettyMarketLabel(normalized: string): string {
  const [city, state] = normalized.split(",").map((p) => p.trim());
  const prettyCity = titleCase(city);
  return state ? `${prettyCity}, ${state.toUpperCase()}` : prettyCity;
}

/** A client/lead row's primary market for grouping, chosen by intent. */
function primaryClientMarket(row: any): { city: string | null; state: string | null; normalized: string | null } {
  const pick = (city: any, state: any) => {
    const normalized = normalizeCityState(city, state);
    return normalized ? { city: cleanText(city), state: cleanText(state), normalized } : null;
  };
  const intent = row.transaction_intent ?? null;
  const buy = pick(row.buying_market_city, row.buying_market_state);
  const sell = pick(row.selling_market_city, row.selling_market_state);
  const fallback = pick(row.market_city, row.market_state);
  let chosen: { city: string | null; state: string | null; normalized: string } | null = null;
  if (intent === "selling") chosen = sell ?? buy ?? fallback;
  else if (intent === "buying" || intent === "both") chosen = buy ?? sell ?? fallback;
  else chosen = fallback ?? buy ?? sell;
  return chosen ?? { city: null, state: null, normalized: null };
}

function transactionLabel(row: any): string | null {
  if (row.transaction_intent_label) return cleanText(row.transaction_intent_label);
  const intent = row.transaction_intent;
  if (intent === "buying") return "Buying";
  if (intent === "selling") return "Selling";
  if (intent === "both") return "Buying and Selling";
  if (intent === "other") return cleanText(row.transaction_intent_other) ?? "Other";
  return null;
}

/**
 * Reviewer Locations view: group clients + agents by normalized market, with
 * counts and (limited) flat lists. All filtering happens server-side; the
 * browser only receives bounded result sets (default limit 50).
 */
export async function listReviewerLocations(
  filters: ReviewerLocationFilters
): Promise<ReviewerLocationsResult> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const q = (filters.q ?? "").trim().toLowerCase();
  const cityFilter = (filters.city ?? "").trim().toLowerCase();
  const stateFilter = (filters.state ?? "").trim();
  const statusFilter = (filters.status ?? "").trim();
  const transactionFilter = (filters.transaction ?? "").trim();
  const stateAbbr = stateFilter ? (normalizeState(stateFilter) ?? stateFilter.toUpperCase()) : null;

  // --- Load bounded source data ------------------------------------------
  const clientRows: any[] = [];
  try {
    const { data } = await supabase
      .from("clients")
      .select("*, agents:assigned_agent_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const c of data ?? []) clientRows.push({ ...c, __rowKind: "client" });
  } catch (error) {
    console.error("[reviewerMatches] locations clients load failed:", error);
  }

  // Completed reviewer leads not represented as a client row (dedupe by email).
  try {
    const existingEmails = new Set(
      clientRows.map((c) => (c.email ? String(c.email).toLowerCase() : null)).filter(Boolean) as string[]
    );
    const { data: leads } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("source", "reviewer")
      .eq("status", "completed")
      .order("last_activity_at", { ascending: false })
      .limit(500);
    for (const l of leads ?? []) {
      const email = l.email ? String(l.email).toLowerCase() : null;
      if (email && existingEmails.has(email)) continue;
      clientRows.push({ ...l, __rowKind: "lead" });
    }
  } catch (error) {
    if (!isMissingTableErrorSafe(error)) console.error("[reviewerMatches] locations leads load failed:", error);
  }

  const agentRowsRaw: any[] = [];
  try {
    const { data } = await supabase
      .from("agents")
      .select("*")
      .not("archetype", "is", null)
      .limit(1000);
    for (const a of data ?? []) agentRowsRaw.push(a);
  } catch (error) {
    console.error("[reviewerMatches] locations agents load failed:", error);
  }

  // --- Normalize + filter clients ----------------------------------------
  const markets = new Map<string, ReviewerMarket & { _city: string | null; _state: string | null }>();
  const clientResults: ReviewerLocationClient[] = [];

  for (const row of clientRows) {
    const market = primaryClientMarket(row);
    const status = reviewerPipelineStatus(row);
    const assigned = Boolean(row.assigned_agent_id) || row.status === "assigned";
    const item: ReviewerLocationClient = {
      id: row.id ?? null,
      rowKind: row.__rowKind === "lead" ? "lead" : "client",
      name: cleanText(row.full_name),
      email: cleanText(row.email),
      archetype: cleanText(row.archetype),
      transactionIntent: cleanText(row.transaction_intent),
      transactionIntentLabel: transactionLabel(row),
      market: market.normalized ? prettyMarketLabel(market.normalized) : cleanText(row.market_city),
      marketNormalized: market.normalized,
      state: market.state ? market.state.toUpperCase() : null,
      status,
      statusLabel: pipelineStatusLabel(status),
      assigned,
      agentName: cleanText(row.agents?.display_name),
    };

    // Filters.
    if (statusFilter && status !== statusFilter) continue;
    if (transactionFilter && (row.transaction_intent ?? "") !== transactionFilter) continue;
    if (stateAbbr && (item.state ?? "").toUpperCase() !== String(stateAbbr).toUpperCase()) continue;
    if (cityFilter && !(item.marketNormalized ?? "").toLowerCase().includes(cityFilter)) continue;
    if (q) {
      const hay = `${item.name ?? ""} ${item.email ?? ""} ${item.market ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    clientResults.push(item);

    // Market aggregation (only when we have a normalized market).
    if (market.normalized) {
      const key = market.normalized;
      const entry =
        markets.get(key) ??
        {
          city: market.city,
          state: market.state ? market.state.toUpperCase() : null,
          normalized: key,
          label: prettyMarketLabel(key),
          clientCount: 0,
          agentCount: 0,
          unmatchedClientCount: 0,
          pairedCount: 0,
          closedCount: 0,
          _city: market.city,
          _state: market.state,
        };
      entry.clientCount += 1;
      if (status === "closed") entry.closedCount += 1;
      else if (assigned) entry.pairedCount += 1;
      else entry.unmatchedClientCount += 1;
      markets.set(key, entry);
    }
  }

  // --- Normalize + filter agents -----------------------------------------
  const agentResults: ReviewerLocationAgent[] = [];
  for (const a of agentRowsRaw) {
    const normalized = a.location_normalized ?? normalizeCityState(a.market_city, a.market_state);
    const stateUpper = (a.market_state ? normalizeState(a.market_state) : normalized ? (normalized.split(",")[1] ?? "").trim().toUpperCase() : null) || null;
    const item: ReviewerLocationAgent = {
      id: a.id ?? null,
      name: cleanText(a.display_name),
      email: cleanText(a.email),
      archetype: cleanText(a.archetype),
      market: normalized ? prettyMarketLabel(normalized) : cleanText(a.market_city),
      marketNormalized: normalized,
      state: stateUpper,
      serviceRadiusMiles: typeof a.service_radius_miles === "number" ? a.service_radius_miles : null,
    };

    if (stateAbbr && (item.state ?? "").toUpperCase() !== String(stateAbbr).toUpperCase()) continue;
    if (cityFilter && !(item.marketNormalized ?? "").toLowerCase().includes(cityFilter)) continue;
    if (q) {
      const hay = `${item.name ?? ""} ${item.email ?? ""} ${item.market ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    agentResults.push(item);
    if (normalized && markets.has(normalized)) markets.get(normalized)!.agentCount += 1;
    else if (normalized) {
      markets.set(normalized, {
        city: item.market,
        state: item.state,
        normalized,
        label: prettyMarketLabel(normalized),
        clientCount: 0,
        agentCount: 1,
        unmatchedClientCount: 0,
        pairedCount: 0,
        closedCount: 0,
        _city: item.market,
        _state: item.state,
      });
    }
  }

  // --- Order + page -------------------------------------------------------
  const allMarkets = Array.from(markets.values())
    .map(({ _city, _state, ...m }) => m)
    .sort((a, b) => b.clientCount + b.agentCount - (a.clientCount + a.agentCount));

  console.log("REVIEWER_LOCATION_QUERY", {
    hasQuery: Boolean(q),
    state: stateAbbr,
    status: statusFilter || null,
    transaction: transactionFilter || null,
    marketCount: allMarkets.length,
    clientCount: clientResults.length,
    agentCount: agentResults.length,
  });

  return {
    markets: allMarkets.slice(offset, offset + limit),
    clients: clientResults.slice(offset, offset + limit),
    agents: agentResults.slice(offset, offset + limit),
    total: {
      marketCount: allMarkets.length,
      clientCount: clientResults.length,
      agentCount: agentResults.length,
    },
  };
}

function isMissingTableErrorSafe(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /relation .* does not exist|could not find the table|schema cache/i.test(msg);
}

export type ReviewerMatchSuggestion = {
  agentId: string | null;
  agentName: string | null;
  agentEmail: string | null;
  agentArchetype: string | null;
  marketCity: string | null;
  marketState: string | null;
  serviceRadiusMiles: number | null;
  distanceMiles: number | null;
  locationScore: number;
  compatibilityScore: number;
  totalScore: number;
  label: string;
  matchReason: string;
  outsideRadius: boolean;
};

/**
 * Top suggested agents for a queued client/lead, ordered by inside-radius, then
 * blended total score, then location score. Used by the reviewer Locations tab
 * and client detail.
 */
export async function getReviewerMatchSuggestions(params: {
  clientId?: string | null;
  leadId?: string | null;
  limit?: number;
}): Promise<{ ok: true; suggestions: ReviewerMatchSuggestion[] }> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 20);

  let rankRow: any = null;
  if (params.clientId) {
    const { data } = await supabase.from("clients").select("*").eq("id", params.clientId).maybeSingle();
    rankRow = data ?? null;
  }
  if (!rankRow && params.leadId) {
    const { data: lead } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("id", params.leadId)
      .maybeSingle();
    if (lead) {
      const scored = assignArchetype((lead.partial_answers as Record<string, string>) || {});
      const archetype = isApprovedClientArchetype(lead.archetype) ? lead.archetype : scored.archetype;
      rankRow = {
        ...lead,
        archetype,
        orientation: scored.orientation,
        style: scored.style,
        stress_response: scored.stressResponse,
        source: "requity_reviewer",
      };
    }
  }
  if (!rankRow) return { ok: true, suggestions: [] };

  const { data: agentRows } = await supabase.from("agents").select("*").not("archetype", "is", null);
  const ranked = await rankAgentsForClientLocationAware(rankRow, agentRows ?? []);

  const suggestions: ReviewerMatchSuggestion[] = ranked.slice(0, limit).map((r) => {
    const a = r.agentRow ?? {};
    return {
      agentId: a.id ?? r.agent.id ?? null,
      agentName: cleanText(a.display_name) ?? r.agent.name ?? null,
      agentEmail: cleanText(a.email),
      agentArchetype: cleanText(a.archetype) ?? r.agent.archetype ?? null,
      marketCity: cleanText(a.market_city),
      marketState: cleanText(a.market_state),
      serviceRadiusMiles: typeof a.service_radius_miles === "number" ? a.service_radius_miles : null,
      distanceMiles: r.distanceMiles,
      locationScore: r.locationScore,
      compatibilityScore: r.score,
      totalScore: r.totalScore,
      label: r.label,
      matchReason: r.matchReason,
      outsideRadius: r.outsideRadius,
    };
  });

  return { ok: true, suggestions };
}
