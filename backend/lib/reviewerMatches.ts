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
import {
  sendClientMatchedEmail,
  sendClientMatchedGetToKnowAgentEmail,
  sendReviewerMatchFinalizedEmail,
  sendReviewerMatchReplacedEmail,
  type EmailTarget,
} from "./email.js";
import { insertWithSchemaFallback } from "./supabaseWrite.js";
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
  combineMatchScore,
  normalizeCityState,
  normalizeState,
  hasUsableAgentLocation,
  hasUsableClientLocation,
  evaluateLocationEligibility,
  evaluateClientLocation,
  type LocationParty,
  type ClientMarketSide,
  type LocationEligibility,
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
  /** Blended total (70% compatibility, 25% location, 5% availability). 0 when ineligible. */
  totalScore: number;
  /** Reviewer-facing one-line explanation of the match. */
  matchReason: string;
  /** True when the client market is outside the agent's service radius. */
  outsideRadius: boolean;
  /** True only when the agent is eligible for an automatic location-based match. */
  eligible: boolean;
  /** Short reason describing the location eligibility outcome. */
  locationReason: string;
  /** Optional reviewer-facing warning (e.g. covers only one side of a both-client). */
  locationWarning: string | null;
  /** True when the agent covers only one side of a buying-and-selling client. */
  limitedFit: boolean;
  /**
   * How many clients this agent is CURRENTLY the active match for. Informational
   * only. Agents are reusable without limit, so this never blocks a match.
   */
  activeMatchCount?: number;
};

/**
 * Match statuses that count as a CURRENT/active pairing for a client. 'active'
 * is the canonical finalized status (migration 0010); 'assigned'/'approved' are
 * kept so pairings created before the migration still count as current.
 */
export const ACTIVE_MATCH_STATUSES = ["active", "assigned", "approved"] as const;

// --- Match lanes (Part 5) ----------------------------------------------------
// A buying-and-selling client may hold one active BUYING match and one active
// SELLING match at the same time (or a single BOTH match when one agent covers
// both sides). Standard clients use the GENERAL lane, preserving the original
// one-active-match behavior exactly.

export const MATCH_LANES = ["buying", "selling", "both", "general"] as const;
export type MatchLane = (typeof MATCH_LANES)[number];

export function isMatchLane(value: unknown): value is MatchLane {
  return typeof value === "string" && (MATCH_LANES as readonly string[]).includes(value);
}

/** Reviewer-facing label for a lane. */
export function matchLaneLabel(lane: string | null | undefined): string {
  const v = (lane ?? "general").toString().toLowerCase();
  if (v === "buying") return "Buying";
  if (v === "selling") return "Selling";
  if (v === "both") return "Buying and Selling";
  return "General";
}

/** The lane of a match row, defaulting rows written before migration 0011. */
function laneOfRow(row: any): MatchLane {
  return isMatchLane(row?.match_lane) ? row.match_lane : "general";
}

/** The default lane for a client's transaction intent when none is specified. */
export function defaultLaneForIntent(intent: string | null | undefined): MatchLane {
  const v = (intent ?? "").toString().toLowerCase();
  if (v === "buying") return "buying";
  if (v === "selling") return "selling";
  if (v === "both") return "both";
  return "general";
}

/** The lanes a client needs covered before they are fully matched. */
export function requiredLanesForIntent(intent: string | null | undefined): MatchLane[] {
  const v = (intent ?? "").toString().toLowerCase();
  if (v === "both") return ["buying", "selling"];
  if (v === "buying") return ["buying"];
  if (v === "selling") return ["selling"];
  return ["general"];
}

/**
 * True when two lanes cannot be active at the same time for one client.
 * 'both' and 'general' cover everything (general is the legacy whole-client
 * lane); 'buying' and 'selling' only conflict with themselves (+ both/general),
 * which is exactly what allows a both-client to hold two lane matches.
 */
export function lanesOverlap(a: MatchLane, b: MatchLane): boolean {
  if (a === b) return true;
  if (a === "both" || a === "general") return true;
  if (b === "both" || b === "general") return true;
  return false;
}

/** The required lanes covered by a set of active lanes (both/general cover all). */
function coveredLanes(required: MatchLane[], activeLanes: MatchLane[]): Set<MatchLane> {
  const covered = new Set<MatchLane>();
  for (const lane of required) {
    if (activeLanes.some((active) => lanesOverlap(active, lane))) covered.add(lane);
  }
  return covered;
}

// --- Reviewer soft delete (Part 6/7) ----------------------------------------
/**
 * True when a row has been archived/soft-deleted by a reviewer. Checked in
 * code (not in the query) so a live schema without the archived_at columns
 * keeps working unchanged.
 */
export function isArchivedRow(row: any): boolean {
  if (!row) return false;
  if (row.archived_at || row.deleted_at) return true;
  return (row.status ?? "") === "archived";
}

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

/** The client market side(s) relevant to scoring, chosen by transaction intent. */
async function clientMarketSides(row: any, memo: Map<string, LocationParty>): Promise<ClientMarketSide[]> {
  const intent = row.transaction_intent ?? null;
  const out: ClientMarketSide[] = [];
  const buy = await marketParty(row.buying_market_city, row.buying_market_state, row.buying_latitude, row.buying_longitude, memo);
  const sell = await marketParty(row.selling_market_city, row.selling_market_state, row.selling_latitude, row.selling_longitude, memo);
  const fallback = await marketParty(row.market_city, row.market_state, row.latitude, row.longitude, memo);
  if (intent === "buying" && buy) out.push({ side: "buying", party: buy });
  else if (intent === "selling" && sell) out.push({ side: "selling", party: sell });
  else if (intent === "both") {
    if (buy) out.push({ side: "buying", party: buy });
    if (sell) out.push({ side: "selling", party: sell });
  } else if (fallback) out.push({ side: "general", party: fallback });
  // Last-resort fallback so we never lose a client with only one market filled.
  if (!out.length) {
    const candidates: Array<[ClientMarketSide["side"], LocationParty | null]> = [
      ["buying", buy],
      ["selling", sell],
      ["general", fallback],
    ];
    for (const [side, p] of candidates) if (p) { out.push({ side, party: p }); break; }
  }
  return out;
}

/** Reviewer-facing one-line reason for any eligibility outcome (eligible or not). */
function buildEligibilityReason(compatibilityScore: number, elig: LocationEligibility): string {
  const personality =
    compatibilityScore >= 90 ? "Strong personality fit" :
    compatibilityScore >= 75 ? "Good personality fit" :
    "Moderate personality fit";
  if (elig.reason === "Agent location missing") return "Agent location missing. Not eligible for a location-based match.";
  if (elig.reason === "Client location missing") return "Client location missing. Add a buying or selling market to match.";
  if (!elig.eligible) {
    if (elig.reason === "Outside agent service range") {
      const d = elig.distanceMiles != null ? ` (about ${elig.distanceMiles} miles away)` : "";
      return `${personality}, but outside the agent service range${d}.`;
    }
    if (elig.warning) return `${personality}. ${elig.warning}`;
    return `${personality}, ${elig.reason.toLowerCase()}.`;
  }
  const base = `${personality} and ${elig.reason.toLowerCase()}`;
  return elig.warning ? `${base}. ${elig.warning}` : base;
}

/**
 * Location-required ranking of agent rows for a client/lead row. Personality
 * compatibility is computed first (never replaced). Location is REQUIRED:
 * agents without a usable location, agents outside the service range, and all
 * agents when the client has no usable location are marked NOT eligible
 * (totalScore 0) and sorted last. Eligible agents are sorted: full fit before
 * limited fit, then blended total desc, then location score desc.
 */
export async function rankAgentsForClientLocationAware(
  clientRow: any,
  agentRows: any[]
): Promise<RankedAgent[]> {
  const client = toClientProfile(clientRow);
  const personalityRanked = rankProfiles(client, (agentRows ?? []).map(toAgentProfile));
  const memo = new Map<string, LocationParty>();
  const sides = await clientMarketSides(clientRow, memo);
  const clientLoc = evaluateClientLocation(clientRow);
  if (!clientLoc.complete) console.log("MATCH_CLIENT_LOCATION_MISSING", { requiredSide: clientLoc.requiredSide });

  const enriched: RankedAgent[] = [];
  for (const match of personalityRanked) {
    const agentRow = (agentRows ?? []).find((a) => a.id === match.agent.id);
    const radius =
      agentRow && typeof agentRow.service_radius_miles === "number" ? agentRow.service_radius_miles : null;
    const agentHasLocation = hasUsableAgentLocation(agentRow);
    const agentParty =
      (await marketParty(
        agentRow?.market_city,
        agentRow?.market_state,
        agentRow?.latitude,
        agentRow?.longitude,
        memo
      )) ?? {};

    const elig: LocationEligibility = clientLoc.complete
      ? evaluateLocationEligibility(sides, agentParty, radius, agentHasLocation)
      : { eligible: false, locationScore: 0, distanceMiles: null, reason: "Client location missing" };

    const totalScore = elig.eligible ? combineMatchScore(match.score, elig.locationScore, 100) : 0;
    const matchReason = buildEligibilityReason(match.score, elig);

    if (!agentHasLocation) {
      console.log("MATCH_AGENT_EXCLUDED_LOCATION_MISSING", { agentId: agentRow?.id ?? null });
    } else if (clientLoc.complete && !elig.eligible && elig.reason === "Outside agent service range") {
      console.log("MATCH_AGENT_EXCLUDED_OUT_OF_RANGE", { agentId: agentRow?.id ?? null, distanceMiles: elig.distanceMiles });
    }
    console.log("MATCH_LOCATION_ELIGIBILITY_RESULT", {
      agentId: agentRow?.id ?? null,
      eligible: elig.eligible,
      locationScore: elig.locationScore,
      distanceMiles: elig.distanceMiles,
      reason: elig.reason,
    });

    enriched.push({
      ...match,
      agentRow,
      locationScore: elig.locationScore,
      distanceMiles: elig.distanceMiles,
      totalScore,
      matchReason,
      outsideRadius: !elig.eligible && elig.reason === "Outside agent service range",
      eligible: elig.eligible,
      locationReason: elig.reason,
      locationWarning: elig.warning ?? null,
      limitedFit: Boolean(elig.limitedFit),
    });
  }

  enriched.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const al = a.limitedFit ? 1 : 0;
    const bl = b.limitedFit ? 1 : 0;
    if (al !== bl) return al - bl;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return b.locationScore - a.locationScore;
  });
  return enriched;
}

export type ReviewerMatchEligibilitySummary = {
  clientLocationStatus: "complete" | "missing";
  eligibleCount: number;
  missingLocationCount: number;
  outOfRangeCount: number;
  incompleteProfileCount: number;
  limitedFitCount: number;
  message: string | null;
  suggestedActions: string[];
};

/**
 * Summarize why (or why not) a client has location-eligible agents, with a clear
 * reviewer message and suggested next actions (Parts 7 and 9). Pure: derives
 * everything from the already-ranked agents.
 */
export function summarizeMatchEligibility(clientRow: any, ranked: RankedAgent[]): ReviewerMatchEligibilitySummary {
  const clientLoc = evaluateClientLocation(clientRow);
  const clientHasLocation = clientLoc.complete && hasUsableClientLocation(clientRow);

  let eligibleCount = 0;
  let missingLocationCount = 0;
  let outOfRangeCount = 0;
  let incompleteProfileCount = 0;
  let limitedFitCount = 0;
  for (const r of ranked) {
    if (r.eligible) {
      eligibleCount += 1;
      if (r.limitedFit) limitedFitCount += 1;
      continue;
    }
    if (r.locationReason === "Agent location missing") missingLocationCount += 1;
    else if (r.locationReason === "Outside agent service range") outOfRangeCount += 1;
    else if (r.locationReason !== "Client location missing") incompleteProfileCount += 1;
  }

  let message: string | null = null;
  const suggestedActions: string[] = [];
  const intentBoth = (clientRow?.transaction_intent ?? "") === "both";

  if (!clientHasLocation) {
    message = "This client needs a buying or selling market before REQUITY can recommend a location-based match.";
    suggestedActions.push("Update client market", "Manually review personality matches");
  } else if (eligibleCount > 0) {
    message = null;
  } else if (intentBoth) {
    message = "No eligible agent currently covers both the buying and selling markets.";
    suggestedActions.push("Expand search radius", "View same-state agents", "Manually review personality matches");
  } else if (outOfRangeCount > 0 && missingLocationCount === 0 && incompleteProfileCount === 0) {
    message = "Agents exist in nearby markets, but none are within the selected service range.";
    suggestedActions.push("Expand search radius", "View same-state agents", "Manually review personality matches");
  } else if (missingLocationCount > 0 && outOfRangeCount === 0 && incompleteProfileCount === 0) {
    message = "Some agents are missing market information and were excluded from matching.";
    suggestedActions.push("Add agent market", "Manually review personality matches");
  } else {
    message = "No eligible agents found in this market.";
    suggestedActions.push("Add agent market", "Expand search radius", "Manually review personality matches");
  }

  return {
    clientLocationStatus: clientHasLocation ? "complete" : "missing",
    eligibleCount,
    missingLocationCount,
    outOfRangeCount,
    incompleteProfileCount,
    limitedFitCount,
    message,
    suggestedActions,
  };
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

  // Archived agents are never suggested for new matches (Part 6/7).
  return rankAgentsForClientLocationAware(
    clientRow,
    (agentRows ?? []).filter((a) => !isArchivedRow(a))
  );
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
      // Archived (soft deleted) clients never appear in active views (Part 7).
      if (isArchivedRow(client)) continue;
      const rankings = await rankAgentsForClient(client.id);
      const enriched = attachClientReport(client) as any;
      enriched.rowKind = "client";
      enriched.pipelineStatus = reviewerPipelineStatus(client);
      enriched.pipelineLabel = pipelineStatusLabel(enriched.pipelineStatus);
      enriched.matchSummary = summarizeMatchEligibility(client, rankings);
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

  // --- Lane status (Part 5): partially matched both-clients stay visible ---
  // Each queue row learns which lanes are already matched (and with whom) and
  // which lanes still need a match, so the reviewer UI can show
  // "Buying matched, selling still needs a match" instead of hiding the client.
  try {
    const clientIds = queue
      .filter((i) => i.client?.rowKind !== "lead" && i.client?.id)
      .map((i) => i.client.id as string);
    const leadIds = queue
      .filter((i) => i.client?.rowKind === "lead" && i.client?.id)
      .map((i) => i.client.id as string);
    const activeByTarget = await getActiveMatchRowsForTargets(clientIds, leadIds);
    for (const item of queue) {
      const key = `${item.client?.rowKind === "lead" ? "lead" : "client"}:${item.client?.id}`;
      item.client.laneStatus = buildLaneStatus(
        item.client?.transaction_intent ?? null,
        activeByTarget.get(key) ?? []
      );
    }
  } catch (error) {
    console.error("[reviewerMatches] queue lane status unavailable:", error);
  }

  // Informational "currently matched with X client(s)" note on each agent card.
  // Never blocks a match; agents are reusable without limit.
  const matchCounts = await getAgentActiveMatchCounts();
  for (const item of queue) {
    for (const r of item.rankings) {
      const agentId = r.agentRow?.id;
      if (agentId) r.activeMatchCount = matchCounts.get(agentId) ?? 0;
    }
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

  // Fetch rankable agents once for all lead-derived items (archived excluded).
  const { data: agentRowsRaw } = await supabase
    .from("agents")
    .select("*")
    .not("archetype", "is", null);
  const agentRows = (agentRowsRaw ?? []).filter((a) => !isArchivedRow(a));

  // Fully matched leads leave the queue; partially matched both-leads stay.
  const leadIdsForStatus = (leads as any[])
    .map((l) => l.id)
    .filter(Boolean) as string[];
  const activeByLead = await getActiveMatchRowsForTargets([], leadIdsForStatus);

  const items: ReviewerQueueItem[] = [];
  for (const lead of leads as any[]) {
    // Archived (soft deleted) leads never appear in active views (Part 7).
    if (isArchivedRow(lead)) continue;
    const email = lead.email ? String(lead.email).toLowerCase() : null;
    // Without an email we cannot dedupe reliably; skip to avoid resurfacing
    // assessments that were already assigned.
    if (!email || existingClientEmails.has(email)) continue;
    // Skip leads whose required lanes are already fully covered by active
    // matches (they belong in Paired Clients, not Up for Review).
    const leadLaneStatus = buildLaneStatus(
      lead.transaction_intent ?? null,
      activeByLead.get(`lead:${lead.id}`) ?? []
    );
    if (leadLaneStatus.fullyMatched && leadLaneStatus.activeMatches.length) continue;

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
    leadClient.matchSummary = summarizeMatchEligibility(rankRow, ranked);
    items.push({ client: leadClient, rankings: ranked });
  }
  return items;
}

export type PairedClientItem = {
  matchId: string | null;
  clientId: string | null;
  /** Set when the pairing is backed by an assessment_leads row (no clients row). */
  leadId?: string | null;
  /** Which side of the transaction this match covers (Part 5). */
  matchLane?: MatchLane;
  matchLaneLabel?: string;
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
  /** Part 12: false when the paired agent has no usable location (needs review). */
  agentHasLocation: boolean;
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
  // Keyed by client (or lead) + lane so a buying-and-selling client with TWO
  // active matches shows BOTH pairings (newest per lane wins). Archived clients,
  // leads, and agents are excluded from this active view (Part 7).
  const byClientLane = new Map<string, PairedClientItem>();
  // Only CURRENT/active pairings. Superseded/declined/archived never show here.
  const PAIRED_STATUSES = ACTIVE_MATCH_STATUSES as unknown as string[];

  const pushItem = (item: PairedClientItem) => {
    const target = item.clientId ?? item.leadId ?? item.matchId ?? `${item.clientName}:${item.agentId}`;
    const key = `${target}:${item.matchLane ?? "general"}`;
    if (target && !byClientLane.has(key)) byClientLane.set(key, item);
  };

  // --- Primary: match_recommendations joined to clients + agents ----------
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("*, clients(*), agents(*)")
      .in("status", PAIRED_STATUSES)
      .order("reviewed_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];

    // Lead-backed pairings (lead_id, no clients row) get their contact fields
    // from assessment_leads so the reviewer still sees who was paired.
    const leadIds = Array.from(
      new Set(rows.filter((r) => !r.clients && r.lead_id).map((r) => r.lead_id))
    ) as string[];
    const leadById = new Map<string, any>();
    if (leadIds.length) {
      try {
        const { data: leadRows } = await supabase
          .from("assessment_leads")
          .select("*")
          .in("id", leadIds);
        for (const l of (leadRows ?? []) as any[]) leadById.set(l.id, l);
      } catch {
        /* lead fields stay empty; the pairing is still listed */
      }
    }

    for (const row of rows) {
      const lead = !row.clients && row.lead_id ? leadById.get(row.lead_id) ?? null : null;
      const client = row.clients ?? lead ?? {};
      const agent = row.agents ?? {};
      // Archived clients/leads/agents never show in the active paired view.
      if (isArchivedRow(row.clients) || isArchivedRow(lead) || isArchivedRow(agent)) continue;
      const lane = laneOfRow(row);
      pushItem({
        matchId: row.id ?? null,
        clientId: row.clients?.id ?? row.client_id ?? null,
        leadId: row.lead_id ?? null,
        matchLane: lane,
        matchLaneLabel: matchLaneLabel(lane),
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
        agentHasLocation: hasUsableAgentLocation(agent),
      });
    }
  } catch (error) {
    console.error("[reviewerMatches] paired (match_recommendations) unavailable:", error);
  }

  // --- Resilience: assigned clients not already represented above ---------
  const representedClients = new Set(
    Array.from(byClientLane.values())
      .map((i) => i.clientId)
      .filter(Boolean) as string[]
  );
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*, agents:assigned_agent_id(*)")
      .eq("status", "assigned")
      .not("assigned_agent_id", "is", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const client of (data ?? []) as any[]) {
      if (client.id && representedClients.has(client.id)) continue;
      if (isArchivedRow(client)) continue;
      const agent = client.agents ?? {};
      if (isArchivedRow(agent)) continue;
      const lane = defaultLaneForIntent(client.transaction_intent);
      pushItem({
        matchId: null,
        clientId: client.id ?? null,
        leadId: null,
        matchLane: lane,
        matchLaneLabel: matchLaneLabel(lane),
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
        agentHasLocation: hasUsableAgentLocation(agent),
      });
    }
  } catch (error) {
    console.error("[reviewerMatches] paired (clients fallback) unavailable:", error);
  }

  return Array.from(byClientLane.values());
}

export type ApproveReviewerMatchResult = {
  ok: true;
  matchId: string;
  clientId: string | null;
  leadId: string | null;
  agentId: string;
  /** The lane this match covers (buying / selling / both / general). */
  matchLane: MatchLane;
  notified: boolean;
  emailed: boolean;
  clientEmailed: boolean;
  /** True when this finalization replaced a previous active match in this lane. */
  replaced: boolean;
  /** True when every required lane for this client is now covered. */
  fullyMatched: boolean;
  /** Lanes that still need a match (empty when fullyMatched). */
  unmatchedLanes: MatchLane[];
};

/** Returned (never thrown) when a client already has a conflicting active match. */
export type ClientAlreadyMatchedResult = {
  ok: false;
  code: "CLIENT_ALREADY_MATCHED";
  message: string;
  activeMatch: {
    agentId: string | null;
    agentName: string | null;
    matchedAt: string | null;
    matchLane?: MatchLane;
    matchLaneLabel?: string;
  };
};

export type FinalizeReviewerMatchResult = ApproveReviewerMatchResult | ClientAlreadyMatchedResult;

/** Detects a status CHECK-constraint violation from a not-yet-migrated DB. */
function isStatusCheckError(error: unknown): boolean {
  const anyErr = (error ?? {}) as { code?: string; message?: string };
  if (anyErr.code === "23514") return true;
  const msg = (anyErr.message ?? String(error)).toLowerCase();
  return msg.includes("status_check") || msg.includes("violates check constraint");
}

/**
 * How many clients each agent is CURRENTLY the active match for. Agents are
 * reusable without limit; this is informational only ("matched with X clients").
 */
export async function getAgentActiveMatchCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("agent_id, client_id, lead_id, status")
      .in("status", ACTIVE_MATCH_STATUSES as unknown as string[]);
    if (error) throw new Error(error.message);
    // De-duplicate per agent+client so a client that also has a superseded row is
    // never double counted, and only count one row per client/lead.
    const seen = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      const agentId = row.agent_id;
      if (!agentId) continue;
      const target = row.client_id ?? row.lead_id ?? row.id;
      const key = `${agentId}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(agentId, (counts.get(agentId) ?? 0) + 1);
    }
  } catch (error) {
    console.error("[reviewerMatches] agent match counts unavailable:", error);
  }
  return counts;
}

/**
 * ALL current active matches for a client or lead (newest first), joined to the
 * agent so callers can report who the client is already matched with. A client
 * may legitimately hold multiple rows (one per lane). Tolerates an un-migrated
 * schema by matching the historical statuses too.
 */
async function findActiveMatchesForTarget(target: {
  clientId?: string | null;
  leadId?: string | null;
}): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  const column = target.clientId ? "client_id" : target.leadId ? "lead_id" : null;
  const value = target.clientId ?? target.leadId ?? null;
  if (!column || !value) return [];
  try {
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("*, agents(*)")
      .eq(column, value)
      .in("status", ACTIVE_MATCH_STATUSES as unknown as string[])
      .order("finalized_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  } catch (error) {
    // lead_id may not exist on an un-migrated schema; degrade to "no active match".
    console.error("[reviewerMatches] findActiveMatches unavailable:", error);
    return [];
  }
}

/**
 * Supersede the given active match rows (used when a lane match is replaced).
 * Only the rows passed in are touched, so replacing a buying match never
 * supersedes an active selling match.
 */
async function supersedeMatchRows(rows: any[]): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const ids = rows.map((r) => r?.id).filter(Boolean) as string[];
  if (!ids.length) return [];
  const now = new Date().toISOString();
  // Try the canonical 'superseded' status; fall back to 'rejected' if the DB
  // has not been migrated to the widened status CHECK yet (both remove the row
  // from the active set so a new active match can be created).
  const { error } = await supabase
    .from("match_recommendations")
    .update({ status: "superseded", superseded_at: now, updated_at: now })
    .in("id", ids);
  if (error && isStatusCheckError(error)) {
    await supabase.from("match_recommendations").update({ status: "rejected" }).in("id", ids);
  } else if (error) {
    console.error("[reviewerMatches] supersede failed:", error.message);
  }
  return ids;
}

// --- Per-client lane status (Part 5 reviewer visibility) --------------------

export type ClientLaneMatch = {
  matchId: string | null;
  lane: MatchLane;
  laneLabel: string;
  agentId: string | null;
  agentName: string | null;
};

export type ClientLaneStatus = {
  requiredLanes: MatchLane[];
  activeMatches: ClientLaneMatch[];
  unmatchedLanes: MatchLane[];
  /** Reviewer-facing labels of lanes still needing a match. */
  unmatchedLaneLabels: string[];
  fullyMatched: boolean;
};

/** Build the lane status for one client/lead row from its active match rows. */
function buildLaneStatus(intent: string | null | undefined, activeRows: any[]): ClientLaneStatus {
  const required = requiredLanesForIntent(intent);
  const activeMatches: ClientLaneMatch[] = (activeRows ?? []).map((row) => ({
    matchId: row.id ?? null,
    lane: laneOfRow(row),
    laneLabel: matchLaneLabel(laneOfRow(row)),
    agentId: row.agent_id ?? null,
    agentName: cleanText((row.agents as any)?.display_name),
  }));
  const covered = coveredLanes(required, activeMatches.map((m) => m.lane));
  const unmatched = required.filter((lane) => !covered.has(lane));
  return {
    requiredLanes: required,
    activeMatches,
    unmatchedLanes: unmatched,
    unmatchedLaneLabels: unmatched.map((l) => matchLaneLabel(l)),
    fullyMatched: unmatched.length === 0,
  };
}

/**
 * Active match rows for many clients/leads in two bounded queries. Keys are
 * `client:<id>` / `lead:<id>`. Missing table/columns degrade to an empty map.
 */
async function getActiveMatchRowsForTargets(
  clientIds: string[],
  leadIds: string[]
): Promise<Map<string, any[]>> {
  const supabase = getSupabaseAdmin();
  const out = new Map<string, any[]>();
  const push = (key: string, row: any) => {
    const list = out.get(key) ?? [];
    list.push(row);
    out.set(key, list);
  };
  try {
    if (clientIds.length) {
      const { data } = await supabase
        .from("match_recommendations")
        .select("id, client_id, agent_id, match_lane, status, agents(display_name)")
        .in("client_id", clientIds)
        .in("status", ACTIVE_MATCH_STATUSES as unknown as string[]);
      for (const row of (data ?? []) as any[]) {
        if (row.client_id) push(`client:${row.client_id}`, row);
      }
    }
    if (leadIds.length) {
      const { data } = await supabase
        .from("match_recommendations")
        .select("id, lead_id, agent_id, match_lane, status, agents(display_name)")
        .in("lead_id", leadIds)
        .in("status", ACTIVE_MATCH_STATUSES as unknown as string[]);
      for (const row of (data ?? []) as any[]) {
        if (row.lead_id) push(`lead:${row.lead_id}`, row);
      }
    }
  } catch (error) {
    console.error("[reviewerMatches] active match lookup unavailable:", error);
  }
  return out;
}

/** Insert a new ACTIVE match row, tolerating missing columns / un-migrated status. */
async function insertActiveMatchRow(values: Record<string, unknown>): Promise<string> {
  try {
    const { data } = await insertWithSchemaFallback<{ id: string }>(
      "match_recommendations",
      { ...values, status: "active", is_selected: true },
      { select: "id" }
    );
    return data.id;
  } catch (error) {
    if (isStatusCheckError(error)) {
      // Un-migrated schema: 'active' is not an allowed status yet. 'assigned' is
      // the historical paired status and is treated as active by this module.
      const { data } = await insertWithSchemaFallback<{ id: string }>(
        "match_recommendations",
        { ...values, status: "assigned" },
        { select: "id" }
      );
      return data.id;
    }
    throw error;
  }
}

/**
 * Shared assignment side-effects for the NEW active match:
 *  - assign the client -> agent (when a clients row exists),
 *  - create the reviewer-match notification for the agent,
 *  - email the agent (dedupe per client+agent) and the reviewer fallback,
 *  - email the client a "get to know your agent" intro (dedupe per client+agent).
 * `party` is the client OR lead row (used for names/email/market).
 */
async function finalizeAssignment(
  party: any,
  agent: any,
  target: { clientId: string | null; leadId: string | null },
  matchLabel?: string | null,
  options?: {
    /**
     * When false (a buying-and-selling client with a lane still unmatched) the
     * clients row keeps status reviewer_matching so it stays in Up for Review
     * until the remaining lane is matched. The agent assignment still happens.
     */
    markAssigned?: boolean;
  }
): Promise<{ notified: boolean; emailed: boolean; clientEmailed: boolean }> {
  const supabase = getSupabaseAdmin();
  const targetId = target.clientId ?? target.leadId ?? party?.id ?? "unknown";
  const markAssigned = options?.markAssigned !== false;

  if (target.clientId) {
    const update: Record<string, unknown> = { assigned_agent_id: agent.id };
    if (markAssigned) update.status = "assigned";
    await supabase.from("clients").update(update).eq("id", target.clientId);
  }

  let notified = false;
  try {
    await createNotification({
      recipientProfileId: agent.profile_id ?? null,
      agentId: agent.id,
      clientId: target.clientId ?? null,
      type: "reviewer_match_received",
      title: "You've received a client match from REQUITY!",
      body: REVIEWER_MATCH_NOTIFICATION_BODY,
    });
    notified = true;
  } catch (error) {
    console.error("[reviewerMatches] notification failed:", error);
  }

  // Email the matched agent, plus the reviewer/admin fallback when configured
  // (and not a duplicate of the agent address). Dedupe is per client+agent so an
  // agent DOES receive a separate email for every different client they match.
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
        eventKey: `agent_match_notification:${targetId}:${agent.id}`,
        recipients,
        clientName: party?.full_name ?? null,
        clientArchetype: party?.archetype ?? null,
        agentName: agent.display_name ?? null,
        matchLabel: matchLabel ?? null,
        transactionIntentLabel: party?.transaction_intent_label ?? null,
        marketCity: party?.market_city ?? null,
      });
      emailed = delivery.emailed;
    } catch (error) {
      console.error("[reviewerMatches] agent email failed:", error instanceof Error ? error.message : error);
    }
  }

  // Client-facing "get to know your agent" email (match finalized). Uses the
  // content-rich SendGrid builder so the client sees who their agent is and what
  // the archetype means without logging in. Best-effort: never blocks matching.
  // Deduped per client + agent + recipient, so a replacement match sends a fresh
  // intro for the new agent. Agent phone is only shown when the agent approved
  // public display (agents.phone_public).
  let clientEmailed = false;
  const clientEmail = (party?.email ?? "").trim();
  if (clientEmail) {
    try {
      const delivery = await sendClientMatchedGetToKnowAgentEmail({
        clientIdOrLeadId: target.clientId ?? target.leadId ?? null,
        agentId: agent.id ?? null,
        clientName: party?.full_name ?? null,
        clientEmail,
        agentName: agent.display_name ?? null,
        agentEmail: agent.email ?? null,
        agentPhone: agent.phone ?? null,
        agentPhonePublic: agent.phone_public === true,
        agentMarket: agent.market_city ?? null,
        agentArchetype: agent.archetype ?? null,
      });
      clientEmailed = delivery.emailed;
    } catch (error) {
      console.error(
        "[reviewerMatches] get-to-know-agent email failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return { notified, emailed, clientEmailed };
}

export type AssignReviewerMatchParams = {
  clientId?: string | null;
  leadId?: string | null;
  agentId: string;
  score?: number;
  reason?: string;
  reviewerId?: string | null;
  /**
   * The lane this match covers (buying / selling / both / general). When
   * omitted, it defaults from the client's transaction intent, so standard
   * clients keep the original single-active-match behavior.
   */
  matchLane?: string | null;
  /** Replace the conflicting active match(es) instead of returning a 409. */
  replaceExisting?: boolean;
  /** Optional reviewer-entered reason shown in the replacement email. */
  replaceReason?: string | null;
};

/** Best-effort lookup of the acting reviewer's email for reviewer emails. */
async function reviewerEmailForProfile(reviewerId: string | null | undefined): Promise<string | null> {
  const id = (reviewerId ?? "").trim();
  if (!id) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("profiles").select("email").eq("id", id).maybeSingle();
    return (data?.email ?? "").trim() || null;
  } catch {
    return null;
  }
}

/** Short reviewer-facing location summary for the finalized email. */
function locationMatchSummary(party: any, agent: any): string | null {
  const agentMarket = [cleanText(agent?.market_city), cleanText(agent?.market_state)]
    .filter(Boolean)
    .join(", ");
  const parts: string[] = [];
  if (agentMarket) parts.push(`Agent market ${agentMarket}`);
  const buy = cleanText(party?.buying_market_city);
  const sell = cleanText(party?.selling_market_city);
  const general = cleanText(party?.market_city);
  if (buy) parts.push(`Client buying market ${buy}`);
  if (sell) parts.push(`Client selling market ${sell}`);
  if (!buy && !sell && general) parts.push(`Client market ${general}`);
  return parts.length ? parts.join(". ") : null;
}

/**
 * Reviewer finalizes a match. Uniqueness is per client (or lead) + LANE:
 *  - a standard client has one active general match,
 *  - a buying-and-selling client may hold one active buying match and one
 *    active selling match (or one combined "both" match),
 *  - the same agent may be active for unlimited clients.
 * If the target already has a conflicting active match in an overlapping lane
 * and `replaceExisting` is not set, returns a CLIENT_ALREADY_MATCHED result
 * (the API layer turns this into a 409). When replacing, ONLY the overlapping
 * lane match(es) are superseded: replacing a buying match never touches an
 * active selling match.
 */
export async function assignReviewerMatch(
  params: AssignReviewerMatchParams
): Promise<FinalizeReviewerMatchResult> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const clientId = params.clientId ?? null;
  const leadId = params.leadId ?? null;
  if (!clientId && !leadId) {
    throw new Error("assignReviewerMatch requires a clientId or leadId.");
  }
  if (params.matchLane != null && params.matchLane !== "" && !isMatchLane(params.matchLane)) {
    throw new Error("Invalid matchLane. Expected one of: buying, selling, both, general.");
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", params.agentId)
    .single();
  if (agentError) throw new Error(`assignReviewerMatch agent failed: ${agentError.message}`);
  if (isArchivedRow(agent)) {
    throw new Error("This agent has been deleted and can no longer be matched.");
  }

  // Load the client (or lead) row for names/email/market. Missing is tolerated.
  let party: any = null;
  if (clientId) {
    const { data } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
    party = data ?? null;
  }
  if (!party && leadId) {
    const { data } = await supabase
      .from("assessment_leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    party = data ?? null;
  }

  const lane: MatchLane = isMatchLane(params.matchLane)
    ? params.matchLane
    : defaultLaneForIntent(party?.transaction_intent);

  // Enforce one active match per client/lead + lane. Only OVERLAPPING lanes
  // conflict, so a both-client can hold a buying and a selling match at once.
  const existingActive = await findActiveMatchesForTarget({ clientId, leadId });
  const conflicting = existingActive.filter((row) => lanesOverlap(laneOfRow(row), lane));
  let replaced = false;
  let replacedRow: any = null;
  if (conflicting.length) {
    const newest = conflicting[0];
    if (newest.agent_id === params.agentId && laneOfRow(newest) === lane) {
      // Same agent already active in this lane: idempotent success.
      console.log("MATCH_ALREADY_ACTIVE_SAME_AGENT", {
        clientId,
        leadId,
        agentId: params.agentId,
        matchLane: lane,
      });
      const laneStatus = buildLaneStatus(party?.transaction_intent, existingActive);
      return {
        ok: true,
        matchId: newest.id,
        clientId,
        leadId,
        agentId: params.agentId,
        matchLane: lane,
        notified: false,
        emailed: false,
        clientEmailed: false,
        replaced: false,
        fullyMatched: laneStatus.fullyMatched,
        unmatchedLanes: laneStatus.unmatchedLanes,
      };
    }
    if (!params.replaceExisting) {
      console.log("MATCH_CLIENT_ALREADY_MATCHED", {
        clientId,
        leadId,
        existingAgentId: newest.agent_id,
        matchLane: lane,
      });
      return {
        ok: false,
        code: "CLIENT_ALREADY_MATCHED",
        message:
          lane === "general" || lane === "both"
            ? "This client already has an active agent match."
            : `This client already has an active ${matchLaneLabel(lane).toLowerCase()} match.`,
        activeMatch: {
          agentId: newest.agent_id ?? null,
          agentName: (newest.agents as any)?.display_name ?? null,
          matchedAt: newest.finalized_at ?? newest.reviewed_at ?? newest.created_at ?? null,
          matchLane: laneOfRow(newest),
          matchLaneLabel: matchLaneLabel(laneOfRow(newest)),
        },
      };
    }
    await supersedeMatchRows(conflicting);
    replaced = true;
    replacedRow = newest;
  }

  const score = params.score ?? 0;
  const matchId = await insertActiveMatchRow({
    client_id: clientId,
    lead_id: leadId,
    agent_id: agent.id,
    score,
    label: labelForScore(score),
    reason: params.reason ?? null,
    reviewer_id: params.reviewerId ?? null,
    match_lane: lane,
    reviewed_at: now,
    finalized_at: now,
  });

  if (replaced) {
    // Link the superseded rows to the new active match (best effort).
    const supersededIds = conflicting.map((r) => r.id).filter(Boolean) as string[];
    if (supersededIds.length) {
      await supabase
        .from("match_recommendations")
        .update({ superseded_by: matchId })
        .in("id", supersededIds);
    }
  }

  // Lane coverage AFTER this match: remaining non-conflicting actives + new one.
  const remainingActive = existingActive.filter((row) => !lanesOverlap(laneOfRow(row), lane));
  const laneStatus = buildLaneStatus(party?.transaction_intent, [
    ...remainingActive,
    { id: matchId, agent_id: agent.id, match_lane: lane, agents: agent },
  ]);

  const { notified, emailed, clientEmailed } = await finalizeAssignment(
    party ?? { id: clientId ?? leadId },
    agent,
    { clientId, leadId },
    labelForScore(score),
    { markAssigned: laneStatus.fullyMatched }
  );

  // Reviewer/admin matching-activity email (Part 4). Best-effort; never blocks
  // the match. A replacement sends the "match replaced" email (with old + new
  // agent); a first-time finalization sends "match finalized".
  const reviewerEmail = await reviewerEmailForProfile(params.reviewerId);
  const targetIdForEmail = clientId ?? leadId ?? null;
  try {
    if (replaced) {
      const oldAgent = (replacedRow?.agents as any) ?? {};
      await sendReviewerMatchReplacedEmail({
        clientIdOrLeadId: targetIdForEmail,
        oldAgentId: replacedRow?.agent_id ?? null,
        newAgentId: agent.id ?? null,
        clientName: party?.full_name ?? null,
        oldAgentName: oldAgent.display_name ?? null,
        oldAgentEmail: oldAgent.email ?? null,
        newAgentName: agent.display_name ?? null,
        newAgentEmail: agent.email ?? null,
        matchType: lane,
        replacedAt: now,
        reviewerEmail,
        reason: params.replaceReason ?? null,
      });
    } else {
      await sendReviewerMatchFinalizedEmail({
        clientIdOrLeadId: targetIdForEmail,
        agentId: agent.id ?? null,
        clientName: party?.full_name ?? null,
        clientEmail: party?.email ?? null,
        agentName: agent.display_name ?? null,
        agentEmail: agent.email ?? null,
        matchType: lane,
        clientArchetype: party?.archetype ?? null,
        agentArchetype: agent.archetype ?? null,
        locationSummary: locationMatchSummary(party, agent),
        finalizedAt: now,
        reviewerEmail,
      });
    }
  } catch (error) {
    console.error(
      "[reviewerMatches] reviewer match email failed:",
      error instanceof Error ? error.message : error
    );
  }

  console.log("MATCH_FINALIZED_ACTIVE", {
    clientId,
    leadId,
    agentId: agent.id,
    matchLane: lane,
    replaced,
    fullyMatched: laneStatus.fullyMatched,
  });
  return {
    ok: true,
    matchId,
    clientId,
    leadId,
    agentId: agent.id,
    matchLane: lane,
    notified,
    emailed,
    clientEmailed,
    replaced,
    fullyMatched: laneStatus.fullyMatched,
    unmatchedLanes: laneStatus.unmatchedLanes,
  };
}

/**
 * Approve an existing reviewer recommendation by id and make it the client's
 * active match. Enforces the same single-active rule (supersedes any other
 * active match for that client/lead).
 */
export async function approveReviewerMatch(
  matchId: string,
  reviewerId?: string | null,
  replaceExisting = false
): Promise<FinalizeReviewerMatchResult> {
  const supabase = getSupabaseAdmin();

  const { data: match, error: matchError } = await supabase
    .from("match_recommendations")
    .select("*, clients(*), agents(*)")
    .eq("id", matchId)
    .single();
  if (matchError) throw new Error(`approveReviewerMatch lookup failed: ${matchError.message}`);

  return assignReviewerMatch({
    clientId: (match as any).client_id ?? null,
    leadId: (match as any).lead_id ?? null,
    agentId: (match as any).agent_id,
    score: typeof (match as any).score === "number" ? (match as any).score : undefined,
    reason: (match as any).reason ?? undefined,
    reviewerId: reviewerId ?? (match as any).reviewer_id ?? null,
    matchLane: isMatchLane((match as any).match_lane) ? (match as any).match_lane : null,
    replaceExisting,
  });
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
  /** Clients in this market with no eligible local agent. */
  noLocalMatchCount: number;
};

export type ClientMatchStatus = "eligible" | "no_local" | "missing" | "paired" | "closed";

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
  /** Location-eligibility status for the Locations tab (Part 8). */
  matchStatus: ClientMatchStatus;
  /** Required market side label: Buying, Selling, Buying and Selling, General. */
  requiredSideLabel: string;
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

/**
 * A flat "Manage locations" entry: every agent, client, and lead (INCLUDING
 * those missing a location) with the raw market fields needed to pre-fill the
 * reviewer edit form. Powers the reviewer add/edit/delete location controls.
 */
export type ReviewerLocationManageEntry = {
  targetType: "agent" | "client" | "lead";
  id: string | null;
  name: string | null;
  email: string | null;
  status: "complete" | "partial" | "missing";
  transactionIntent: string | null;
  transactionIntentLabel: string | null;
  marketCity: string | null;
  marketState: string | null;
  serviceRadiusMiles: number | null;
  buyingMarketCity: string | null;
  buyingMarketState: string | null;
  sellingMarketCity: string | null;
  sellingMarketState: string | null;
};

export type ReviewerLocationsResult = {
  markets: ReviewerMarket[];
  clients: ReviewerLocationClient[];
  agents: ReviewerLocationAgent[];
  /** Flat list for the Manage locations section (bounded). */
  manage: ReviewerLocationManageEntry[];
  total: {
    marketCount: number;
    clientCount: number;
    agentCount: number;
    /** Agents excluded from matching because they have no usable market. */
    agentsMissingLocation: number;
    /** Clients with no usable buying/selling/general market. */
    clientsMissingLocation: number;
    /** Clients with a location but no eligible local agent. */
    noLocalMatch: number;
    /** Entries returned in the manage list. */
    manageCount: number;
  };
};

export type ReviewerLocationFilters = {
  q?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  transaction?: string | null;
  /** Part 8: eligible | no_local | missing_client | agents_missing. */
  eligibility?: string | null;
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
  const eligibilityFilter = (filters.eligibility ?? "").trim();
  const stateAbbr = stateFilter ? (normalizeState(stateFilter) ?? stateFilter.toUpperCase()) : null;

  // --- Load bounded source data (archived rows excluded, Part 7) ----------
  const clientRows: any[] = [];
  try {
    const { data } = await supabase
      .from("clients")
      .select("*, agents:assigned_agent_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const c of data ?? []) {
      if (isArchivedRow(c)) continue;
      clientRows.push({ ...c, __rowKind: "client" });
    }
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
      if (isArchivedRow(l)) continue;
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
    for (const a of data ?? []) {
      if (isArchivedRow(a)) continue;
      agentRowsRaw.push(a);
    }
  } catch (error) {
    console.error("[reviewerMatches] locations agents load failed:", error);
  }

  const markets = new Map<string, ReviewerMarket & { _city: string | null; _state: string | null }>();

  const makeMarket = (
    normalized: string,
    city: string | null,
    state: string | null
  ): ReviewerMarket & { _city: string | null; _state: string | null } => ({
    city,
    state: state ? state.toUpperCase() : null,
    normalized,
    label: prettyMarketLabel(normalized),
    clientCount: 0,
    agentCount: 0,
    unmatchedClientCount: 0,
    pairedCount: 0,
    closedCount: 0,
    noLocalMatchCount: 0,
    _city: city,
    _state: state,
  });

  // --- Agents first: needed to know which markets have an eligible agent ---
  // Agents without a usable location are NEVER eligible for matching, so they are
  // excluded from the per-market lists and counted separately (Part 8).
  const agentResults: ReviewerLocationAgent[] = [];
  const marketsWithEligibleAgent = new Set<string>();
  let agentsMissingLocation = 0;

  for (const a of agentRowsRaw) {
    if (!hasUsableAgentLocation(a)) {
      agentsMissingLocation += 1;
      continue;
    }
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

    if (normalized) marketsWithEligibleAgent.add(normalized);

    if (stateAbbr && (item.state ?? "").toUpperCase() !== String(stateAbbr).toUpperCase()) continue;
    if (cityFilter && !(item.marketNormalized ?? "").toLowerCase().includes(cityFilter)) continue;
    if (q) {
      const hay = `${item.name ?? ""} ${item.email ?? ""} ${item.market ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    agentResults.push(item);
    if (normalized) {
      const entry = markets.get(normalized) ?? makeMarket(normalized, item.market, item.state);
      entry.agentCount += 1;
      markets.set(normalized, entry);
    }
  }

  const hasAgentInMarket = (n: string | null): boolean => Boolean(n && marketsWithEligibleAgent.has(n));

  // --- Clients: classify match status using the eligible-agent markets ----
  const clientResults: ReviewerLocationClient[] = [];
  let clientsMissingLocation = 0;
  let noLocalMatch = 0;

  for (const row of clientRows) {
    const market = primaryClientMarket(row);
    const status = reviewerPipelineStatus(row);
    const assigned = Boolean(row.assigned_agent_id) || row.status === "assigned";
    const clientLoc = evaluateClientLocation(row);
    const requiredSideLabel =
      clientLoc.requiredSide === "buying" ? "Buying" :
      clientLoc.requiredSide === "selling" ? "Selling" :
      clientLoc.requiredSide === "both" ? "Buying and Selling" : "General";

    // Match status (Part 8): closed/paired by pipeline; otherwise location-driven.
    let matchStatus: ClientMatchStatus;
    if (status === "closed") matchStatus = "closed";
    else if (assigned) matchStatus = "paired";
    else if (!hasUsableClientLocation(row)) matchStatus = "missing";
    else {
      const intent = (row.transaction_intent ?? "").toString();
      let eligible: boolean;
      if (intent === "both") {
        const buyNorm = normalizeCityState(row.buying_market_city, row.buying_market_state);
        const sellNorm = normalizeCityState(row.selling_market_city, row.selling_market_state);
        eligible = hasAgentInMarket(buyNorm) && hasAgentInMarket(sellNorm);
      } else {
        eligible = hasAgentInMarket(market.normalized);
      }
      matchStatus = eligible ? "eligible" : "no_local";
    }

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
      matchStatus,
      requiredSideLabel,
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
    // Match-eligibility filter (Part 8). agents_missing is agent-focused and does
    // not narrow the client list.
    if (eligibilityFilter === "eligible" && matchStatus !== "eligible") continue;
    if (eligibilityFilter === "no_local" && matchStatus !== "no_local") continue;
    if (eligibilityFilter === "missing_client" && matchStatus !== "missing") continue;

    clientResults.push(item);
    if (matchStatus === "missing") clientsMissingLocation += 1;
    if (matchStatus === "no_local") noLocalMatch += 1;

    // Market aggregation (only when we have a normalized market).
    if (market.normalized) {
      const key = market.normalized;
      const entry = markets.get(key) ?? makeMarket(key, market.city, market.state);
      entry.clientCount += 1;
      if (status === "closed") entry.closedCount += 1;
      else if (assigned) entry.pairedCount += 1;
      else entry.unmatchedClientCount += 1;
      if (matchStatus === "no_local") entry.noLocalMatchCount += 1;
      markets.set(key, entry);
    }
  }

  // --- Manage locations: flat list of everyone (incl. missing location) ----
  // Only the free-text search narrows this list; the browser applies its own
  // type + missing-location sub-filters. Bounded so the browser never overloads.
  const manage: ReviewerLocationManageEntry[] = [];
  const MANAGE_CAP = 200;
  const manageMatchesQuery = (e: ReviewerLocationManageEntry): boolean => {
    if (!q) return true;
    const hay = `${e.name ?? ""} ${e.email ?? ""} ${e.marketCity ?? ""} ${e.marketState ?? ""} ${e.buyingMarketCity ?? ""} ${e.sellingMarketCity ?? ""}`.toLowerCase();
    return hay.includes(q);
  };
  for (const a of agentRowsRaw) {
    if (manage.length >= MANAGE_CAP) break;
    const entry: ReviewerLocationManageEntry = {
      targetType: "agent",
      id: a.id ?? null,
      name: cleanText(a.display_name),
      email: cleanText(a.email),
      status: hasUsableAgentLocation(a) ? "complete" : "missing",
      transactionIntent: null,
      transactionIntentLabel: null,
      marketCity: cleanText(a.market_city),
      marketState: cleanText(a.market_state),
      serviceRadiusMiles: typeof a.service_radius_miles === "number" ? a.service_radius_miles : null,
      buyingMarketCity: null,
      buyingMarketState: null,
      sellingMarketCity: null,
      sellingMarketState: null,
    };
    if (manageMatchesQuery(entry)) manage.push(entry);
  }
  for (const row of clientRows) {
    if (manage.length >= MANAGE_CAP) break;
    const loc = evaluateClientLocation(row);
    const status: "complete" | "partial" | "missing" = loc.complete
      ? "complete"
      : hasUsableClientLocation(row)
        ? "partial"
        : "missing";
    const entry: ReviewerLocationManageEntry = {
      targetType: row.__rowKind === "lead" ? "lead" : "client",
      id: row.id ?? null,
      name: cleanText(row.full_name),
      email: cleanText(row.email),
      status,
      transactionIntent: cleanText(row.transaction_intent),
      transactionIntentLabel: transactionLabel(row),
      marketCity: cleanText(row.market_city),
      marketState: cleanText(row.market_state),
      serviceRadiusMiles: null,
      buyingMarketCity: cleanText(row.buying_market_city),
      buyingMarketState: cleanText(row.buying_market_state),
      sellingMarketCity: cleanText(row.selling_market_city),
      sellingMarketState: cleanText(row.selling_market_state),
    };
    if (manageMatchesQuery(entry)) manage.push(entry);
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
    eligibility: eligibilityFilter || null,
    marketCount: allMarkets.length,
    clientCount: clientResults.length,
    agentCount: agentResults.length,
    agentsMissingLocation,
    clientsMissingLocation,
    noLocalMatch,
  });

  return {
    markets: allMarkets.slice(offset, offset + limit),
    clients: clientResults.slice(offset, offset + limit),
    agents: agentResults.slice(offset, offset + limit),
    manage,
    total: {
      marketCount: allMarkets.length,
      clientCount: clientResults.length,
      agentCount: agentResults.length,
      agentsMissingLocation,
      clientsMissingLocation,
      noLocalMatch,
      manageCount: manage.length,
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
  eligible: boolean;
  limitedFit: boolean;
  warning: string | null;
  /** Informational: how many clients this agent is currently the active match for. */
  activeMatchCount: number;
};

export type ReviewerMatchSuggestionsResult = {
  ok: true;
  clientLocationStatus: "complete" | "missing";
  eligibleAgents: ReviewerMatchSuggestion[];
  /** Backward-compatible alias of eligibleAgents (only location-eligible agents). */
  suggestions: ReviewerMatchSuggestion[];
  excludedAgents: { missingLocation: number; outOfRange: number; incompleteProfile: number };
  message: string | null;
  suggestedActions: string[];
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
}): Promise<ReviewerMatchSuggestionsResult> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 20);

  const emptyResult: ReviewerMatchSuggestionsResult = {
    ok: true,
    clientLocationStatus: "missing",
    eligibleAgents: [],
    suggestions: [],
    excludedAgents: { missingLocation: 0, outOfRange: 0, incompleteProfile: 0 },
    message: "This client needs a buying or selling market before REQUITY can recommend a location-based match.",
    suggestedActions: ["Update client market", "Manually review personality matches"],
  };

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
  if (!rankRow) return emptyResult;

  const { data: agentRows } = await supabase.from("agents").select("*").not("archetype", "is", null);
  const ranked = await rankAgentsForClientLocationAware(
    rankRow,
    (agentRows ?? []).filter((a) => !isArchivedRow(a))
  );
  const summary = summarizeMatchEligibility(rankRow, ranked);
  const matchCounts = await getAgentActiveMatchCounts();

  const toSuggestion = (r: RankedAgent): ReviewerMatchSuggestion => {
    const a = r.agentRow ?? {};
    const agentId = a.id ?? r.agent.id ?? null;
    return {
      agentId,
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
      eligible: r.eligible,
      limitedFit: r.limitedFit,
      warning: r.locationWarning,
      activeMatchCount: agentId ? matchCounts.get(agentId) ?? 0 : 0,
    };
  };

  // Only location-eligible agents are recommended. Ineligible agents (missing
  // location, out of range, etc.) are summarized as counts, never shown as a match.
  const eligibleAgents = ranked.filter((r) => r.eligible).slice(0, limit).map(toSuggestion);

  if (summary.eligibleCount === 0) {
    console.log("MATCH_NO_ELIGIBLE_LOCAL_AGENT", {
      clientLocationStatus: summary.clientLocationStatus,
      missingLocationCount: summary.missingLocationCount,
      outOfRangeCount: summary.outOfRangeCount,
    });
  }

  return {
    ok: true,
    clientLocationStatus: summary.clientLocationStatus,
    eligibleAgents,
    suggestions: eligibleAgents,
    excludedAgents: {
      missingLocation: summary.missingLocationCount,
      outOfRange: summary.outOfRangeCount,
      incompleteProfile: summary.incompleteProfileCount,
    },
    message: summary.message,
    suggestedActions: summary.suggestedActions,
  };
}
