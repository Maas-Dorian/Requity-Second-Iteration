/**
 * Agent dashboard history normalization (backward compatibility).
 *
 * Older client assessments reached an agent through three shapes over time:
 *   1. clients rows with assigned_agent_id (current shape, richest data)
 *   2. match_recommendations rows for the agent whose client was later
 *      re-assigned to another agent (the clients row no longer points here)
 *   3. assessment_leads rows tied to the agent that never became clients rows
 *
 * The dashboard used to read only shape 1, so shapes 2 and 3 (and clients
 * archived by a reviewer) silently disappeared. This module merges all
 * sources into normalized "legacy" records with inferred lanes and safe
 * date fallbacks, deduped so each historical client shows exactly once.
 *
 * Pure and dependency-free so it can be unit tested without env/DB access.
 */

export const DASH_LANES = ["buying", "selling", "both", "general"] as const;
export type DashLane = (typeof DASH_LANES)[number];

export const DASH_LANE_LABELS: Record<DashLane, string> = {
  buying: "Buying",
  selling: "Selling",
  both: "Buying and Selling",
  general: "General",
};

export function isDashLane(value: unknown): value is DashLane {
  return typeof value === "string" && (DASH_LANES as readonly string[]).includes(value);
}

/**
 * Infer a lane from the client's transaction intent when a match row carries
 * no lane (records created before lane-aware matching).
 */
export function inferLaneFromIntent(intent: unknown): DashLane {
  const v = (intent ?? "").toString().trim().toLowerCase();
  if (v === "buying") return "buying";
  if (v === "selling") return "selling";
  if (v === "both" || v === "buying_and_selling") return "both";
  return "general";
}

/** First non-empty ISO date string from the candidates, else null. */
export function firstDate(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

/** Lifecycle statuses that must stay hidden even from the legacy view. */
const NEVER_RESURFACE = new Set(["deleted", "abandoned"]);

export type AgentLegacyRecord = {
  /** Stable dedupe key. */
  key: string;
  matchId: string | null;
  clientId: string | null;
  leadId: string | null;
  lane: DashLane;
  laneLabel: string;
  /** Raw historical status (superseded, rejected, completed, ...). */
  status: string;
  receivedAt: string | null;
  /** Match fit score when the source match row carried one. */
  fit: number | null;
  /** True when enough structured data exists for the full report. */
  hasFullAssessment: boolean;
  /** Client-shaped row (real clients row, or synthesized from a lead). */
  client: Record<string, any>;
};

function cleanEmail(value: unknown): string {
  return (value ?? "").toString().trim().toLowerCase();
}

/** Synthesize a client-shaped row from an assessment_leads row. */
export function clientShapeFromLead(lead: any): Record<string, any> {
  return {
    id: lead.id,
    full_name: lead.full_name ?? lead.name ?? "Unknown client",
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    archetype: lead.archetype ?? null,
    status: lead.status ?? "completed",
    source: lead.source ?? "reviewer",
    market_city: lead.market_city ?? null,
    buying_market_city: lead.buying_market_city ?? null,
    selling_market_city: lead.selling_market_city ?? null,
    transaction_intent: lead.transaction_intent ?? null,
    transaction_intent_label: lead.transaction_intent_label ?? null,
    appreciation_style: lead.appreciation_style ?? null,
    agent_expectations_notes: lead.agent_expectations_notes ?? null,
    notes: lead.notes ?? null,
    created_at: lead.created_at ?? null,
    updated_at: lead.updated_at ?? lead.last_activity_at ?? null,
  };
}

/**
 * Merge match history + lead-only assessments into deduped legacy records.
 *
 * Dedupe order (richest wins):
 *   1. clients already assigned to the agent are skipped entirely (they render
 *      as live cards) - keyed by clientId
 *   2. one record per clientId + lane (newest match row wins)
 *   3. one record per leadId + lane
 *   4. email as the last-resort cross-source key (a lead whose email matches an
 *      assigned client or an already-added record is skipped)
 */
export function normalizeAgentLegacyRecords(input: {
  assignedClients: any[];
  matchRows: any[];
  leadRows: any[];
}): AgentLegacyRecord[] {
  const assignedIds = new Set(
    (input.assignedClients ?? []).map((c) => c?.id).filter(Boolean)
  );
  const assignedEmails = new Set(
    (input.assignedClients ?? []).map((c) => cleanEmail(c?.email)).filter(Boolean)
  );

  const out = new Map<string, AgentLegacyRecord>();
  const seenEmails = new Set<string>();

  // Newest first so the first row kept per key is the richest/most recent.
  const sortedMatches = [...(input.matchRows ?? [])].sort((a, b) =>
    String(b?.created_at ?? "").localeCompare(String(a?.created_at ?? ""))
  );

  for (const m of sortedMatches) {
    const clientId = m?.client_id ?? null;
    const leadId = m?.lead_id ?? null;
    if (clientId && assignedIds.has(clientId)) continue; // live card already

    const client = (m?.clients as any) ?? null;
    const lead = (m?.assessment_leads as any) ?? null;
    const party = client ?? lead;
    if (!party) continue; // no joined data left to display

    const lifecycle = (party.status ?? "").toString().toLowerCase();
    if (NEVER_RESURFACE.has(lifecycle)) continue;

    const lane = isDashLane(m?.match_lane)
      ? (m.match_lane as DashLane)
      : inferLaneFromIntent(party.transaction_intent);

    const key = clientId
      ? `c:${clientId}:${lane}`
      : leadId
        ? `l:${leadId}:${lane}`
        : `m:${m?.id ?? Math.random()}`;
    if (out.has(key)) continue;

    const email = cleanEmail(party.email);
    // A lead-sourced match whose email belongs to an assigned client is the
    // same person; the live card already covers them.
    if (!client && email && assignedEmails.has(email)) continue;

    out.set(key, {
      key,
      matchId: m?.id ?? null,
      clientId,
      leadId,
      lane,
      laneLabel: DASH_LANE_LABELS[lane],
      status: (m?.status ?? "history").toString(),
      receivedAt: firstDate(
        m?.finalized_at,
        m?.created_at,
        party.completed_at,
        party.created_at,
        party.updated_at
      ),
      fit: typeof m?.score === "number" ? m.score : null,
      hasFullAssessment: Boolean(party.archetype),
      client: client ? { ...client } : clientShapeFromLead(lead),
    });
    if (email) seenEmails.add(email);
  }

  // Lead-only completed assessments tied to this agent (pre-clients flow).
  for (const lead of input.leadRows ?? []) {
    if (!lead?.id) continue;
    const lifecycle = (lead.status ?? "").toString().toLowerCase();
    if (NEVER_RESURFACE.has(lifecycle)) continue;

    const email = cleanEmail(lead.email);
    if (email && (assignedEmails.has(email) || seenEmails.has(email))) continue;

    const lane = inferLaneFromIntent(lead.transaction_intent);
    const key = `l:${lead.id}:${lane}`;
    if (out.has(key)) continue;

    out.set(key, {
      key,
      matchId: null,
      clientId: null,
      leadId: lead.id,
      lane,
      laneLabel: DASH_LANE_LABELS[lane],
      status: (lead.status ?? "completed").toString(),
      receivedAt: firstDate(
        lead.completed_at,
        lead.last_activity_at,
        lead.created_at,
        lead.updated_at
      ),
      fit: null,
      hasFullAssessment: Boolean(lead.archetype),
      client: clientShapeFromLead(lead),
    });
    if (email) seenEmails.add(email);
  }

  return [...out.values()];
}
