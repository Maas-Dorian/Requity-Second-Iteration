import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { updateWithSchemaFallback } from "./supabaseWrite.js";
import { agentArchetypeMap } from "./matching.js";
import {
  ACTIVE_MATCH_STATUSES,
  isArchivedRow,
  matchLaneLabel,
} from "./reviewerMatches.js";
import { getLatestAgentPaymentStatuses } from "./payments.js";
import { hasUsableAgentLocation } from "./location.js";
import { updateReviewerLocation } from "./reviewerLocationAdmin.js";
import { sendAppEmail } from "./email.js";
import {
  buildRequityEmailHtml,
  buildPlainTextEmail,
  getPublicSiteUrl,
} from "./emailTemplate.js";
import { createNotification } from "./messages.js";

/**
 * Reviewer Agent Control Center (reviewer/admin only).
 *
 * One place to list, inspect, and manage every agent: location, archetype,
 * payment status, matches, assessment update requests, and soft archive.
 * Everything is resilient to an un-migrated live DB (missing columns from
 * migration 0014 degrade instead of crashing), and nothing here ever hard
 * deletes an agent or touches historical match records.
 */

const AGENT_LIST_LIMIT = 1000;

// Columns needed for the list view. `select("*")` is avoided so the payload
// stays small even with many agents (no assessment_responses blobs).
const LIST_COLUMNS =
  "id, display_name, email, phone, brokerage, archetype, archetype_completed_at, " +
  "market_city, market_state, service_radius_miles, latitude, longitude, " +
  "location_normalized, service_areas, created_at, updated_at, archived_at, deleted_at";

export type ReviewerAgentListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  marketCity: string | null;
  marketState: string | null;
  serviceRadiusMiles: number | null;
  serviceAreas: unknown[];
  archetype: string | null;
  paymentStatus: string;
  paymentStatusLabel: string;
  activeMatchCount: number;
  status: "active" | "archived";
  missingLocation: boolean;
  missingArchetype: boolean;
  needsAssessmentUpdate: boolean;
  lastActivityAt: string | null;
  createdAt: string | null;
};

export type ReviewerAgentsSummary = {
  totalAgents: number;
  activeAgents: number;
  unpaidAgents: number;
  missingLocation: number;
  missingArchetype: number;
  activeMatches: number;
};

/** Active match counts per agent in one bounded query. Degrades to empty. */
async function getActiveMatchCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("match_recommendations")
      .select("agent_id")
      .in("status", ACTIVE_MATCH_STATUSES as unknown as string[])
      .limit(4000);
    if (error) throw error;
    for (const row of (data ?? []) as any[]) {
      if (!row.agent_id) continue;
      out.set(row.agent_id, (out.get(row.agent_id) ?? 0) + 1);
    }
  } catch (error) {
    console.error("[reviewerAgents] active match counts unavailable:", error);
  }
  return out;
}

function toListItem(
  row: any,
  matchCounts: Map<string, number>,
  payments: Map<string, { status: string; statusLabel: string }>
): ReviewerAgentListItem {
  const pay = payments.get(row.id) ?? null;
  const archived = isArchivedRow(row);
  return {
    id: row.id,
    name: row.display_name ?? "Unknown agent",
    email: row.email ?? null,
    phone: row.phone ?? null,
    marketCity: row.market_city ?? null,
    marketState: row.market_state ?? null,
    serviceRadiusMiles:
      typeof row.service_radius_miles === "number" ? row.service_radius_miles : null,
    serviceAreas: Array.isArray(row.service_areas) ? row.service_areas : [],
    archetype: row.archetype ?? null,
    paymentStatus: pay?.status ?? "unpaid",
    paymentStatusLabel: pay?.statusLabel ?? "Unpaid",
    activeMatchCount: matchCounts.get(row.id) ?? 0,
    status: archived ? "archived" : "active",
    missingLocation: !hasUsableAgentLocation(row),
    missingArchetype: !row.archetype,
    needsAssessmentUpdate: Boolean(row.needs_assessment_update),
    lastActivityAt: row.updated_at ?? row.created_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * Every agent (active AND archived, so the Control Center can filter both)
 * with payment status, active match count, and data-quality flags, plus the
 * summary counts for the top cards. One bounded agents query per load.
 */
export async function listReviewerAgents(): Promise<{
  agents: ReviewerAgentListItem[];
  summary: ReviewerAgentsSummary;
}> {
  const supabase = getSupabaseAdmin();

  let rows: any[] = [];
  try {
    const { data, error } = await supabase
      .from("agents")
      .select(LIST_COLUMNS)
      .order("display_name", { ascending: true })
      .limit(AGENT_LIST_LIMIT);
    if (error) throw error;
    rows = (data ?? []) as any[];
  } catch (error) {
    // Column drift (e.g. pre-0009 schema): degrade to a full select once.
    console.error("[reviewerAgents] list columns select failed, retrying with *:", error);
    const { data, error: retryError } = await supabase
      .from("agents")
      .select("*")
      .order("display_name", { ascending: true })
      .limit(AGENT_LIST_LIMIT);
    if (retryError) throw new Error(`listReviewerAgents failed: ${retryError.message}`);
    rows = (data ?? []) as any[];
  }

  const [matchCounts, paymentMap] = await Promise.all([
    getActiveMatchCounts(),
    getLatestAgentPaymentStatuses(),
  ]);

  const agents = rows.map((row) => toListItem(row, matchCounts, paymentMap));
  const active = agents.filter((a) => a.status === "active");

  const summary: ReviewerAgentsSummary = {
    totalAgents: agents.length,
    activeAgents: active.length,
    unpaidAgents: active.filter(
      (a) => a.paymentStatus === "unpaid" || a.paymentStatus === "invoice_sent"
    ).length,
    missingLocation: active.filter((a) => a.missingLocation).length,
    missingArchetype: active.filter((a) => a.missingArchetype).length,
    activeMatches: active.reduce((sum, a) => sum + a.activeMatchCount, 0),
  };

  return { agents, summary };
}

export type ReviewerAgentMatchItem = {
  matchId: string;
  clientId: string | null;
  leadId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  lane: string;
  laneLabel: string;
  market: string | null;
  status: string;
  isActive: boolean;
  matchedAt: string | null;
  supersededAt: string | null;
  lastEmailSentAt: string | null;
};

/**
 * Newest successful match email per (target[, lane]) for ONE agent, read from
 * email_events dedupe keys `agent_match_notification:<target>:<agent>[:<lane>]:<email>`.
 * Resilient: any error (missing table/columns) returns an empty map.
 */
async function getAgentMatchEmailTimes(agentId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("email_events")
      .select("event_key, sent_at, created_at")
      .eq("event_type", "client_matched")
      .eq("status", "sent")
      .like("event_key", "agent_match_notification:%")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    const LANES = new Set(["buying", "selling", "both", "general"]);
    for (const row of (data ?? []) as any[]) {
      const parts = String(row.event_key ?? "").split(":");
      // parts: [prefix, target, agent, (lane), recipientEmail]
      if (parts.length < 4 || parts[2] !== agentId) continue;
      const when = row.sent_at ?? row.created_at ?? null;
      if (!when) continue;
      const target = parts[1];
      if (!out.has(target) || out.get(target)! < when) out.set(target, when);
      if (parts.length >= 5 && LANES.has(parts[3])) {
        const laneKey = `${target}:${parts[3]}`;
        if (!out.has(laneKey) || out.get(laneKey)! < when) out.set(laneKey, when);
      }
    }
  } catch (error) {
    console.error("[reviewerAgents] agent match email times unavailable:", error);
  }
  return out;
}

export type ReviewerAgentDetail = {
  agent: ReviewerAgentListItem & {
    brokerage: string | null;
    licenseNumber: string | null;
    interactionStyle: string | null;
    focus: string | null;
    stressResponse: string | null;
    perceivedValue: string | null;
    negotiationStyle: string | null;
    archetypeCompletedAt: string | null;
    assessmentSummary: Record<string, unknown>;
    reviewerNotes: string | null;
    assessmentUpdateRequestedAt: string | null;
    latitude: number | null;
    longitude: number | null;
    locationNormalized: string | null;
  };
  matches: ReviewerAgentMatchItem[];
  payment: {
    status: string;
    statusLabel: string;
    amountCents: number | null;
    note: string | null;
    updatedAt: string | null;
  };
};

const AGENT_MATCH_STATUS_ACTIVE = new Set(ACTIVE_MATCH_STATUSES as unknown as string[]);

/** Full detail for one agent: profile, all matches (history kept), payment. */
export async function getReviewerAgentDetail(agentId: string): Promise<ReviewerAgentDetail> {
  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(`getReviewerAgentDetail failed: ${error.message}`);
  if (!row) {
    const notFound = new Error("Agent not found.");
    (notFound as any).status = 404;
    throw notFound;
  }

  const emailTimes = await getAgentMatchEmailTimes(agentId);

  // All matches for this agent (active AND historical), joined to the client
  // or lead for a readable name. Bounded and resilient.
  let matches: ReviewerAgentMatchItem[] = [];
  try {
    const { data: matchRows, error: matchError } = await supabase
      .from("match_recommendations")
      .select(
        "id, client_id, lead_id, match_lane, status, score, created_at, finalized_at, superseded_at, " +
          "clients(full_name, email, market_city, buying_market_city, selling_market_city), " +
          "assessment_leads(name, email, market_city)"
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (matchError) throw matchError;
    matches = ((matchRows ?? []) as any[]).map((m) => {
      const client = (m.clients as any) ?? null;
      const lead = (m.assessment_leads as any) ?? null;
      const lane = m.match_lane ?? "general";
      const market =
        client?.market_city ?? client?.buying_market_city ?? client?.selling_market_city ??
        lead?.market_city ?? null;
      const emailTarget = m.client_id ?? m.lead_id ?? null;
      const lastEmailSentAt = emailTarget
        ? emailTimes.get(`${emailTarget}:${lane}`) ?? emailTimes.get(emailTarget) ?? null
        : null;
      return {
        matchId: m.id,
        clientId: m.client_id ?? null,
        leadId: m.lead_id ?? null,
        clientName: client?.full_name ?? lead?.name ?? null,
        clientEmail: client?.email ?? lead?.email ?? null,
        lane,
        laneLabel: matchLaneLabel(lane),
        market,
        status: m.status ?? "unknown",
        isActive: AGENT_MATCH_STATUS_ACTIVE.has(m.status ?? ""),
        matchedAt: m.finalized_at ?? m.created_at ?? null,
        supersededAt: m.superseded_at ?? null,
        lastEmailSentAt,
      };
    });
  } catch (matchError) {
    console.error("[reviewerAgents] agent matches unavailable:", matchError);
  }

  const paymentMap = await getLatestAgentPaymentStatuses([agentId]);
  const pay = paymentMap.get(agentId) ?? null;
  const matchCounts = new Map<string, number>([
    [agentId, matches.filter((m) => m.isActive).length],
  ]);
  const payments = new Map<string, { status: string; statusLabel: string }>();
  if (pay) payments.set(agentId, { status: pay.status, statusLabel: pay.statusLabel });

  const base = toListItem(row, matchCounts, payments);

  return {
    agent: {
      ...base,
      brokerage: row.brokerage ?? null,
      licenseNumber: row.license_number ?? null,
      interactionStyle: row.interaction_style ?? null,
      focus: row.focus ?? null,
      stressResponse: row.stress_response ?? null,
      perceivedValue: row.perceived_value ?? null,
      negotiationStyle: row.negotiation_style ?? null,
      archetypeCompletedAt: row.archetype_completed_at ?? null,
      assessmentSummary:
        row.assessment_summary && typeof row.assessment_summary === "object"
          ? row.assessment_summary
          : {},
      reviewerNotes: row.reviewer_notes ?? null,
      assessmentUpdateRequestedAt: row.assessment_update_requested_at ?? null,
      latitude: typeof row.latitude === "number" ? row.latitude : null,
      longitude: typeof row.longitude === "number" ? row.longitude : null,
      locationNormalized: row.location_normalized ?? null,
    },
    matches,
    payment: {
      status: pay?.status ?? "unpaid",
      statusLabel: pay?.statusLabel ?? "Unpaid",
      amountCents: pay?.amountCents ?? null,
      note: pay?.note ?? null,
      updatedAt: pay?.updatedAt ?? null,
    },
  };
}

// The 16 canonical agent archetypes a reviewer may assign, derived from the
// authoritative matching map so this list can never drift.
export const AGENT_ARCHETYPES: readonly string[] = Object.keys(agentArchetypeMap);

export type UpdateReviewerAgentParams = {
  agentId: string;
  /** Reassign the agent archetype (validated against the canonical list). */
  archetype?: string | null;
  /** Internal reviewer notes (migration 0014). */
  reviewerNotes?: string | null;
  /** Restore an archived agent back into matching. */
  restore?: boolean;
  /** Location fields; forwarded to the shared reviewer location admin. */
  location?: {
    marketCity?: string | null;
    marketState?: string | null;
    serviceRadiusMiles?: number | null;
    serviceAreas?: string | null;
  } | null;
};

/**
 * Reviewer-only agent update: location (via the shared, geocoding-aware
 * location admin), archetype, reviewer notes, and restore-from-archive.
 * Only the provided fields change.
 */
export async function updateReviewerAgent(params: UpdateReviewerAgentParams): Promise<{
  ok: true;
  agentId: string;
  updated: string[];
}> {
  const supabase = getSupabaseAdmin();
  const agentId = (params.agentId ?? "").trim();
  if (!agentId) throw new Error("An agentId is required.");

  const { data: agent, error } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(`updateReviewerAgent lookup failed: ${error.message}`);
  if (!agent) {
    const notFound = new Error("Agent not found.");
    (notFound as any).status = 404;
    throw notFound;
  }

  const updated: string[] = [];
  const now = new Date().toISOString();

  if (params.location) {
    await updateReviewerLocation({
      targetType: "agent",
      targetId: agentId,
      location: {
        marketCity: params.location.marketCity ?? null,
        marketState: params.location.marketState ?? null,
        serviceRadiusMiles: params.location.serviceRadiusMiles ?? null,
        serviceAreas: params.location.serviceAreas ?? null,
      },
    });
    updated.push("location");
  }

  if (params.archetype !== undefined && params.archetype !== null) {
    const archetype = String(params.archetype).trim();
    if (!AGENT_ARCHETYPES.includes(archetype)) {
      const invalid = new Error(
        `Invalid archetype. Expected one of: ${AGENT_ARCHETYPES.join(", ")}.`
      );
      (invalid as any).status = 400;
      throw invalid;
    }
    await updateWithSchemaFallback(
      "agents",
      { archetype, updated_at: now },
      { column: "id", value: agentId },
      { required: ["archetype"] }
    );
    updated.push("archetype");
  }

  if (params.reviewerNotes !== undefined) {
    // reviewer_notes requires migration 0014; surface a clear error if absent.
    await updateWithSchemaFallback(
      "agents",
      { reviewer_notes: (params.reviewerNotes ?? "").toString().trim() || null, updated_at: now },
      { column: "id", value: agentId },
      { required: ["reviewer_notes"] }
    );
    updated.push("notes");
  }

  if (params.restore) {
    await updateWithSchemaFallback(
      "agents",
      { archived_at: null, deleted_at: null, updated_at: now },
      { column: "id", value: agentId },
      { required: ["archived_at"] }
    );
    updated.push("restore");
  }

  console.log("REVIEWER_AGENT_UPDATED", { agentId, updated });
  return { ok: true, agentId, updated };
}

/**
 * Reviewer-only: request an assessment update from an agent (Part 7 Option B).
 * Sets agents.needs_assessment_update = true (agent dashboard shows a banner
 * with a button to retake) and emails the agent a link to the login-gated
 * assessment page. Only reviewers can reach this; agents cannot set the flag.
 */
export async function requestAgentAssessmentUpdate(agentId: string): Promise<{
  ok: true;
  agentId: string;
  emailed: boolean;
}> {
  const supabase = getSupabaseAdmin();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, display_name, email, profile_id, archived_at, deleted_at")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(`requestAgentAssessmentUpdate lookup failed: ${error.message}`);
  if (!agent) {
    const notFound = new Error("Agent not found.");
    (notFound as any).status = 404;
    throw notFound;
  }

  const now = new Date().toISOString();
  // needs_assessment_update requires migration 0014. Making it required means
  // an un-migrated DB gets a clear error instead of a silent no-op.
  await updateWithSchemaFallback(
    "agents",
    {
      needs_assessment_update: true,
      assessment_update_requested_at: now,
      updated_at: now,
    },
    { column: "id", value: agentId },
    { required: ["needs_assessment_update"] }
  );

  // In-app notification (best effort).
  try {
    await createNotification({
      recipientProfileId: (agent as any).profile_id ?? null,
      agentId,
      type: "system",
      title: "REQUITY has requested an assessment update",
      body:
        "Please update your REQUITY assessment so your archetype and matching profile stay accurate.",
    });
  } catch (notifyError) {
    console.error("[reviewerAgents] assessment update notification failed:", notifyError);
  }

  // Email the agent a link to the login-gated assessment page (best effort;
  // the dashboard banner works even if the email fails).
  let emailed = false;
  const to = ((agent as any).email ?? "").trim();
  if (to) {
    try {
      const updateUrl = `${getPublicSiteUrl()}/agent/assessment.html?retake=1`;
      const agentName = (agent as any).display_name ?? null;
      const content = {
        title: "REQUITY has requested an assessment update",
        intro:
          "REQUITY has asked you to update your agent assessment. Updating it keeps your archetype and client matching profile accurate, so future matches reflect how you work today. You will be asked to sign in to your REQUITY agent account first.",
        ctaLabel: "Update my assessment",
        ctaUrl: updateUrl,
      };
      const result = await sendAppEmail({
        eventType: "agent_assessment_update_requested",
        // Unique per request so repeated reviewer requests are never deduped away.
        eventKey: `agent_assessment_update_requested:${agentId}:${Date.now()}`,
        to,
        toName: agentName,
        subject: "REQUITY has requested an assessment update",
        html: buildRequityEmailHtml(content),
        text: buildPlainTextEmail(content),
        tags: ["agent", "assessment-update"],
        metadata: { agentId, purpose: "assessment_update_request" },
      });
      emailed = Boolean(result.emailed);
    } catch (emailError) {
      console.error("[reviewerAgents] assessment update email failed:", emailError);
    }
  }

  console.log("REVIEWER_AGENT_ASSESSMENT_UPDATE_REQUESTED", { agentId, emailed });
  return { ok: true, agentId, emailed };
}
