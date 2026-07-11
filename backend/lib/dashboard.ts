import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { env, isUsablePublicOrigin } from "./env.js";
import { getAgentNotifications, type NotificationRecord } from "./messages.js";
import { getAgentAssessmentActivity, type AgentAssessmentActivity } from "./analytics.js";
import { isMissingTableError, updateWithSchemaFallback } from "./supabaseWrite.js";
import { attachClientReport } from "./clientReport.js";
import { ensureAgentSlug } from "./agentSlug.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Client pipeline status (agent-controlled dashboard dropdown)
// ---------------------------------------------------------------------------

/** The four agent-controlled pipeline statuses shown on the dashboard. */
export const PIPELINE_STATUSES = ["potential", "active", "under_contract", "closed"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Human-readable labels for each pipeline status (shared dashboard + reviewer). */
export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  potential: "Potential",
  active: "Active",
  under_contract: "Under Contract",
  closed: "Closed",
};

/** Safe label lookup, defaulting to Potential for unknown/missing values. */
export function pipelineStatusLabel(value: unknown): string {
  return isPipelineStatus(value) ? PIPELINE_STATUS_LABELS[value] : PIPELINE_STATUS_LABELS.potential;
}

/** Statuses that must be hidden from the normal dashboard sections entirely. */
const HIDDEN_LIFECYCLE = new Set(["abandoned", "deleted", "archived"]);

export function isPipelineStatus(value: unknown): value is PipelineStatus {
  return typeof value === "string" && (PIPELINE_STATUSES as readonly string[]).includes(value);
}

/**
 * Resolve a client's effective pipeline status for the dashboard.
 *
 * Priority:
 *   1. The agent's explicit choice in `pipeline_status` (authoritative).
 *   2. Otherwise DERIVE from the legacy lifecycle/deal columns so existing rows
 *      classify sensibly with no backfill:
 *        - deal_status closed              → closed
 *        - deal_status closing             → under_contract
 *        - status assigned/matched         → active
 *        - status under_contract           → under_contract
 *        - status closed                   → closed
 *        - status abandoned/deleted/...    → hidden
 *        - everything else (completed/...) → potential
 *
 * Returns one of the four statuses, or "hidden" when the row must not appear.
 */
export function derivePipelineStatus(
  client: { pipeline_status?: unknown; status?: unknown; deal_status?: unknown } | null | undefined
): PipelineStatus | "hidden" {
  const explicit = (client?.pipeline_status ?? "").toString().trim().toLowerCase();
  if (isPipelineStatus(explicit)) return explicit;
  if (HIDDEN_LIFECYCLE.has(explicit)) return "hidden";

  const deal = (client?.deal_status ?? "").toString().trim().toLowerCase();
  if (deal === "closed") return "closed";
  if (deal === "closing") return "under_contract";

  const lifecycle = (client?.status ?? "").toString().trim().toLowerCase();
  if (HIDDEN_LIFECYCLE.has(lifecycle)) return "hidden";
  if (lifecycle === "assigned" || lifecycle === "matched") return "active";
  if (lifecycle === "under_contract") return "under_contract";
  if (lifecycle === "closed") return "closed";
  return "potential";
}

/** Structured error carrying an HTTP status the API layer honors. */
function statusError(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Update one client's agent-controlled pipeline status. Verifies the requesting
 * agent owns (is assigned to) the client unless they are an admin. Keeps the
 * legacy deal_status/close_date coherent so the status-based closings query and
 * the new pipeline classification never disagree:
 *   - closed       → deal_status 'closed', close_date today (if empty)
 *   - re-opened    → deal_status 'active', close_date cleared
 * Tolerates schema drift (a missing pipeline_status/deal_status column is
 * dropped from the write rather than failing the whole update).
 */
export async function updateClientPipelineStatus(params: {
  clientId: string;
  agentId: string | null;
  isAdmin: boolean;
  status: PipelineStatus;
}): Promise<{ clientId: string; status: PipelineStatus }> {
  const { clientId, agentId, isAdmin, status } = params;
  if (!isPipelineStatus(status)) {
    throw statusError(400, `Invalid status. Expected one of: ${PIPELINE_STATUSES.join(", ")}.`, "INVALID_STATUS");
  }

  const supabase = getSupabaseAdmin();

  // Ownership check: the client must exist and be assigned to this agent.
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, assigned_agent_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      throw statusError(404, "Client record not found.", "CLIENT_NOT_FOUND");
    }
    throw statusError(500, `Could not load client: ${error.message}`, "CLIENT_LOOKUP_FAILED");
  }
  if (!client) {
    throw statusError(404, "Client record not found.", "CLIENT_NOT_FOUND");
  }
  const assignedAgentId = (client as { assigned_agent_id?: string | null }).assigned_agent_id ?? null;
  if (!isAdmin && (!agentId || assignedAgentId !== agentId)) {
    throw statusError(403, "You don't have access to this client.", "CLIENT_FORBIDDEN");
  }

  // Keep the legacy deal columns coherent with the pipeline status.
  const patch: Record<string, unknown> = { pipeline_status: status };
  if (status === "closed") {
    patch.deal_status = "closed";
    patch.close_date = new Date().toISOString().slice(0, 10);
  } else {
    patch.deal_status = "active";
    patch.close_date = null;
  }

  await updateWithSchemaFallback("clients", patch, { column: "id", value: clientId });

  return { clientId, status };
}

/**
 * Reviewer/admin status update for a matched/paired client or lead. Unlike the
 * agent path this does NOT enforce client ownership (a reviewer manages every
 * client), but the caller MUST already be an authenticated reviewer/admin.
 *
 * Writes the authoritative `pipeline_status` (the same field the agent dashboard
 * reads first), so a reviewer change shows on the agent dashboard after refresh
 * and vice versa. Keeps the legacy deal columns coherent on the clients row. For
 * lead-only rows (no clients row yet) it writes `assessment_leads.pipeline_status`
 * only, never the lifecycle `status`, so the reviewer queue classification
 * (which filters status = 'completed') is left intact.
 *
 * Accepts a clientId, a leadId, or both (when linked, both are updated). Tolerates
 * schema drift (a missing pipeline_status column is dropped from the write).
 */
export async function updateClientStatusByReviewer(params: {
  clientId?: string | null;
  leadId?: string | null;
  status: PipelineStatus;
}): Promise<{ ok: true; status: PipelineStatus; label: string; clientId: string | null; leadId: string | null }> {
  const status = params.status;
  if (!isPipelineStatus(status)) {
    throw statusError(400, `Invalid status. Expected one of: ${PIPELINE_STATUSES.join(", ")}.`, "INVALID_STATUS");
  }
  const clientId = params.clientId ? String(params.clientId).trim() : null;
  const leadId = params.leadId ? String(params.leadId).trim() : null;
  if (!clientId && !leadId) {
    throw statusError(400, "A clientId or leadId is required.", "MISSING_TARGET");
  }

  let touched = false;

  if (clientId) {
    const clientPatch: Record<string, unknown> = { pipeline_status: status };
    if (status === "closed") {
      clientPatch.deal_status = "closed";
      clientPatch.close_date = new Date().toISOString().slice(0, 10);
    } else {
      clientPatch.deal_status = "active";
      clientPatch.close_date = null;
    }
    try {
      await updateWithSchemaFallback("clients", clientPatch, { column: "id", value: clientId });
      touched = true;
    } catch (error) {
      // A genuinely missing clients table should not fail a lead-only update.
      if (!isMissingTableError(error)) throw error;
    }
  }

  if (leadId) {
    try {
      await updateWithSchemaFallback(
        "assessment_leads",
        { pipeline_status: status },
        { column: "id", value: leadId }
      );
      touched = true;
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  if (!touched) {
    throw statusError(404, "No matching client or lead row to update.", "TARGET_NOT_FOUND");
  }

  return { ok: true, status, label: PIPELINE_STATUS_LABELS[status], clientId, leadId };
}

/**
 * Return the agent's public assessment token, generating + persisting one when
 * the row has none yet (e.g. an older agent created before the column default).
 * This guarantees the dashboard link + QR code always have a real value to use.
 * Returns null only when the token genuinely cannot be stored (e.g. the column
 * is missing on a not-yet-migrated DB) so callers can show a clean error state.
 */
export async function ensureAgentPublicToken(agentId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("public_assessment_token")
    .eq("id", agentId)
    .maybeSingle();
  if (data?.public_assessment_token) return data.public_assessment_token;

  const token = randomBytes(16).toString("hex");
  const { data: updated, error } = await supabase
    .from("agents")
    .update({ public_assessment_token: token })
    .eq("id", agentId)
    .select("public_assessment_token")
    .maybeSingle();
  if (error) {
    console.error("[dashboard] ensureAgentPublicToken failed:", error.message);
    return null;
  }
  return updated?.public_assessment_token ?? token;
}

/**
 * Aggregated agent dashboard payload for the secure API route.
 * Mirrors the sections of agent/dashboard.html so the frontend can render real
 * data while keeping the same layout.
 */

export type AgentDashboard = {
  agent: {
    id: string;
    displayName: string;
    email: string;
    archetype: string | null;
    /** ISO timestamp the agent completed their archetype assessment, or null. */
    archetypeCompletedAt: string | null;
    /** City/market the agent works in, or null when not provided/migrated. */
    marketCity: string | null;
    /** State of that market, or null when not provided/migrated. */
    marketState: string | null;
    /** Normalized "city, st" key, or null when not provided/migrated. */
    locationNormalized: string | null;
    /** Branded public link slug, or null when not generated/migrated. */
    publicSlug: string | null;
    /** True when a reviewer has requested an assessment update (migration 0014). */
    needsAssessmentUpdate: boolean;
  } | null;
  assessmentLink: string;
  qrLink: string;
  assessmentActivity: {
    linkOpened: number;
    started: number;
    completed: number;
  };
  /**
   * Real last-7-days assessment activity for the "Assessment activity" chart.
   * Null when the analytics query fails, the rest of the dashboard still loads
   * and the chart shows a clean error state.
   */
  weeklyActivity: AgentAssessmentActivity | null;
  clientFlowCounts: {
    total: number;
    qr: number;
    reviewer: number;
    assigned: number;
    awaitingReview: number;
  };
  recentClients: Array<{
    id: string;
    name: string;
    archetype: string | null;
    status: string;
    source: string;
    updatedAt: string;
  }>;
  messages: NotificationRecord[];
  clientAssessmentDetail: any[];
  /** Matched clients for this agent (live data; empty when none). */
  matches: Array<{
    id: string;
    name: string;
    archetype: string | null;
    transaction: string | null;
    buyingMarket: string | null;
    sellingMarket: string | null;
    market: string | null;
    fit: number | null;
    status: string;
    date: string | null;
    /** Which side this agent covers: buying | selling | both | general | null. */
    lane: string | null;
    laneLabel: string | null;
    /** When the active match was finalized (falls back to the client date). */
    receivedAt: string | null;
    /** Agent-controlled pipeline status (potential/active/under_contract/closed). */
    pipelineStatus: string;
  }>;
  /**
   * The agent's OWN payment status with REQUITY (agents are also REQUITY
   * clients). Null when no reviewer has set one yet. This is never a consumer
   * client's payment status.
   */
  agentPaymentStatus: { status: string; label: string; updatedAt: string | null } | null;
  /** Closing/closed deals for this agent (live data; empty when none). */
  closings: Array<{
    id: string;
    name: string;
    transaction: string | null;
    market: string | null;
    status: string;
    closeDate: string | null;
  }>;
  settings: {
    accountEmail: string | null;
    supabaseConnected: boolean;
    oauth: { google: string; apple: string; email: string };
  };
};

/**
 * Build an agent's public assessment links.
 *  - assessmentLink: shareable link (source `agent_link`)
 *  - qrLink: link encoded in the QR code (source `qr`)
 *
 * Preference order (Part 5, slug first, token fallback):
 *   1. When a branded `slug` exists, use the clean URL on the public origin:
 *        https://www.requityapp.com/<slug>            (agent_link)
 *        https://www.requityapp.com/<slug>?source=qr  (qr)
 *      This never exposes the raw token in the visible URL.
 *   2. Otherwise fall back to the legacy token link so links always work:
 *        <frontend>/client/assessment.html?agent=<token>&source=agent_link|qr
 * Both attach visiting/scanning clients directly to the agent (never the
 * reviewer queue). Returns empty strings only when neither slug nor token exist.
 */
export function buildAgentAssessmentLinks(opts: {
  token?: string | null;
  slug?: string | null;
  frontendUrl?: string;
}): { assessmentLink: string; qrLink: string } {
  // Share/QR links must ALWAYS be the live production origin. An explicit
  // frontendUrl override is honored only when it is itself a usable production
  // origin (never localhost and never the deleted preview deployment); otherwise
  // we use the sanitized public site URL.
  const base = (
    isUsablePublicOrigin(opts.frontendUrl) ? opts.frontendUrl! : env.publicSiteUrl
  ).replace(/\/$/, "");

  if (opts.slug) {
    return {
      assessmentLink: `${base}/${opts.slug}`,
      qrLink: `${base}/${opts.slug}?source=qr`,
    };
  }
  const t = opts.token ?? "";
  return {
    assessmentLink: t ? `${base}/client/assessment.html?agent=${t}&source=agent_link` : "",
    qrLink: t ? `${base}/client/assessment.html?agent=${t}&source=qr` : "",
  };
}

/** Look up an agent's public assessment links by agent id (slug-first, token fallback). */
export async function getAgentAssessmentLinks(
  agentId: string,
  options: { frontendUrl?: string } = {}
): Promise<{ assessmentLink: string; qrLink: string }> {
  const token = await ensureAgentPublicToken(agentId);
  // Backfill a branded slug if missing (resilient: returns null on schema drift).
  const slug = await ensureAgentSlug(agentId);
  return buildAgentAssessmentLinks({ token, slug, frontendUrl: options.frontendUrl });
}

export async function getAgentDashboard(
  agentId: string,
  options: { frontendUrl?: string } = {}
): Promise<AgentDashboard> {
  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, display_name, email, archetype, archetype_completed_at, public_assessment_token")
    .eq("id", agentId)
    .maybeSingle();

  // Backfill a public token if this agent has none, so the link/QR always work.
  const publicToken =
    agent?.public_assessment_token ?? (agent ? await ensureAgentPublicToken(agentId) : null);

  // City/market is read separately and resiliently: on a not-yet-migrated DB the
  // `market_city` column may be absent, which must NOT break the dashboard. A
  // missing column surfaces as an error (not a throw), so we simply fall back to
  // null and the UI shows "Not specified".
  let marketCity: string | null = null;
  let marketState: string | null = null;
  let locationNormalized: string | null = null;
  // Reviewer-requested assessment update flag (migration 0014). Read separately
  // and resiliently so a not-yet-migrated DB never breaks the dashboard.
  let needsAssessmentUpdate = false;
  if (agent) {
    const { data: flagRow } = await supabase
      .from("agents")
      .select("needs_assessment_update")
      .eq("id", agentId)
      .maybeSingle();
    needsAssessmentUpdate = Boolean(
      flagRow && (flagRow as { needs_assessment_update?: boolean | null }).needs_assessment_update
    );
  }
  if (agent) {
    const { data: marketRow } = await supabase
      .from("agents")
      .select("market_city")
      .eq("id", agentId)
      .maybeSingle();
    marketCity = (marketRow && (marketRow as { market_city?: string | null }).market_city) || null;
    // Structured location columns may be absent on a not-yet-migrated DB; read
    // them separately so a missing column never nulls out market_city above.
    const { data: locRow } = await supabase
      .from("agents")
      .select("market_state, location_normalized")
      .eq("id", agentId)
      .maybeSingle();
    marketState = (locRow && (locRow as { market_state?: string | null }).market_state) || null;
    locationNormalized = (locRow && (locRow as { location_normalized?: string | null }).location_normalized) || null;
  }

  // Clients are an OPTIONAL/legacy enrichment source. On a drifted live DB that
  // is missing public.clients, the dashboard must still load with empty client
  // data instead of crashing. A genuine (non-missing-table) error still throws.
  let clientsList: any[] = [];
  let clientsTableMissing = false;
  {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("*, assessments(*)")
      .eq("assigned_agent_id", agentId)
      .order("created_at", { ascending: false });
    if (clientsError) {
      if (isMissingTableError(clientsError)) {
        clientsTableMissing = true;
      } else {
        throw new Error(`getAgentDashboard clients failed: ${clientsError.message}`);
      }
    } else {
      clientsList = clients ?? [];
    }
  }

  // Messages are optional too, never let a missing table break the dashboard.
  let messages: NotificationRecord[] = [];
  try {
    messages = await getAgentNotifications(agentId, { limit: 50 });
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[dashboard] messages load failed:", error);
    }
  }

  // Backfill the branded public slug on dashboard load (Part 9). Resilient:
  // returns null on schema drift, in which case we fall back to the token link.
  const publicSlug = agent ? await ensureAgentSlug(agentId, agent.display_name) : null;

  const { assessmentLink, qrLink } = buildAgentAssessmentLinks({
    token: publicToken,
    slug: publicSlug,
    frontendUrl: options.frontendUrl,
  });

  const list = clientsList;
  const activity = { linkOpened: 0, started: 0, completed: 0 };
  const flow = { total: list.length, qr: 0, reviewer: 0, assigned: 0, awaitingReview: 0 };

  for (const c of list) {
    if (c.status === "draft" || c.status === "started") activity.linkOpened += 1;
    if (c.status === "started") activity.started += 1;
    if (c.status === "completed" || c.status === "assigned") activity.completed += 1;
    if (c.source === "qr") flow.qr += 1;
    if (c.source === "requity_reviewer") flow.reviewer += 1;
    if (c.status === "assigned") flow.assigned += 1;
    if (c.status === "reviewer_matching") flow.awaitingReview += 1;
  }

  // Real per-day assessment activity. Isolated so an analytics failure never
  // blocks the rest of the dashboard from loading.
  let weeklyActivity: AgentAssessmentActivity | null = null;
  try {
    weeklyActivity = await getAgentAssessmentActivity(agentId, 7);
  } catch (error) {
    console.error("[dashboard] weeklyActivity failed:", error);
    weeklyActivity = null;
  }

  logger.info("dashboard_agent", {
    area: "dashboard_agent",
    resolvedAgentId: !!agent,
    clientsTableMissing,
    clientCount: list.length,
    weeklyActivityAvailable: !!weeklyActivity,
  });

  const recentClients = list.slice(0, 8).map((c) => ({
    id: c.id,
    name: c.full_name,
    archetype: c.archetype ?? null,
    status: c.status,
    source: c.source,
    updatedAt: c.updated_at ?? c.created_at,
  }));

  // Match fit scores + lanes (optional enrichment). A drifted DB without
  // match_recommendations must NOT break the dashboard.
  const fitByClient = new Map<string, number>();
  const laneByClient = new Map<string, { lane: string; receivedAt: string | null }>();
  try {
    const clientIds = list.map((c) => c.id).filter(Boolean);
    if (clientIds.length) {
      const { data: recs, error: recError } = await supabase
        .from("match_recommendations")
        .select("client_id, score, match_lane, status, finalized_at, created_at")
        .eq("agent_id", agentId)
        .in("client_id", clientIds);
      if (!recError) {
        for (const r of (recs ?? []) as any[]) {
          const cid = r.client_id as string | undefined;
          const score = r.score as number | undefined;
          if (cid && typeof score === "number") {
            // Keep the highest score per client.
            fitByClient.set(cid, Math.max(fitByClient.get(cid) ?? 0, score));
          }
          // Lane comes from the ACTIVE match row for this agent + client.
          const status = String(r.status ?? "").toLowerCase();
          if (cid && (status === "active" || status === "assigned" || status === "approved")) {
            laneByClient.set(cid, {
              lane: typeof r.match_lane === "string" && r.match_lane ? r.match_lane : "general",
              receivedAt: r.finalized_at ?? r.created_at ?? null,
            });
          }
        }
      }
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[dashboard] match scores load failed:", error);
    }
  }

  // The agent's OWN payment status with REQUITY (migration 0012). Resilient:
  // a missing table means "not set" and the dashboard loads normally.
  let agentPaymentStatus: { status: string; label: string; updatedAt: string | null } | null = null;
  try {
    const { data: payRow, error: payError } = await supabase
      .from("reviewer_payment_statuses")
      .select("status, updated_at, created_at")
      .eq("entity_type", "agent")
      .eq("entity_id", agentId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!payError && payRow) {
      const PAY_LABELS: Record<string, string> = {
        unpaid: "Unpaid",
        invoice_sent: "Invoice sent",
        paid: "Paid",
        waived: "Waived",
        refunded: "Refunded",
        not_required: "Not required",
      };
      const s = String((payRow as any).status ?? "unpaid");
      agentPaymentStatus = {
        status: s,
        label: PAY_LABELS[s] ?? "Unpaid",
        updatedAt: (payRow as any).updated_at ?? (payRow as any).created_at ?? null,
      };
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error("[dashboard] agent payment status load failed:", error);
    }
  }

  const cleanCity = (v: unknown): string | null => {
    const s = (v ?? "").toString().trim();
    return s.length ? s : null;
  };
  const txnLabel = (c: any): string | null =>
    cleanCity(c.transaction_intent_label) ??
    (c.transaction_intent ? String(c.transaction_intent) : null);

  // Matches: clients matched/assigned to this agent (all clients in `list` are
  // assigned to this agent). Live data only, never fabricated.
  const LANE_LABELS: Record<string, string> = {
    buying: "Buying",
    selling: "Selling",
    both: "Buying and Selling",
    general: "General",
  };
  const matches = list.map((c) => {
    const laneInfo = laneByClient.get(c.id) ?? null;
    const pipeline = derivePipelineStatus(c);
    return {
      id: c.id,
      name: c.full_name,
      archetype: c.archetype ?? null,
      transaction: txnLabel(c),
      buyingMarket: cleanCity(c.buying_market_city),
      sellingMarket: cleanCity(c.selling_market_city),
      market: cleanCity(c.market_city),
      fit: fitByClient.has(c.id) ? fitByClient.get(c.id)! : null,
      status: c.status,
      date: c.updated_at ?? c.created_at ?? null,
      lane: laneInfo ? laneInfo.lane : null,
      laneLabel: laneInfo ? LANE_LABELS[laneInfo.lane] ?? "General" : null,
      receivedAt: laneInfo?.receivedAt ?? c.created_at ?? null,
      pipelineStatus: pipeline === "hidden" ? "potential" : pipeline,
    };
  });

  // Closings: status-based. `deal_status` / `close_date` may be absent on a
  // not-yet-migrated DB (select * simply omits them) → no closings, clean state.
  const closings = list
    .filter((c) => {
      const ds = (c.deal_status ?? "").toString().toLowerCase();
      return ds === "closing" || ds === "closed" || !!c.close_date;
    })
    .map((c) => ({
      id: c.id,
      name: c.full_name,
      transaction: txnLabel(c),
      market: cleanCity(c.market_city),
      status: (c.deal_status ?? "closing").toString(),
      closeDate: c.close_date ?? null,
    }));

  return {
    agent: agent
      ? {
          id: agent.id,
          displayName: agent.display_name,
          email: agent.email,
          archetype: agent.archetype ?? null,
          archetypeCompletedAt: agent.archetype_completed_at ?? null,
          marketCity,
          marketState,
          locationNormalized,
          publicSlug,
          needsAssessmentUpdate,
        }
      : null,
    assessmentLink,
    qrLink,
    assessmentActivity: activity,
    weeklyActivity,
    clientFlowCounts: flow,
    recentClients,
    messages,
    // Each client carries a `.report` with the full Relational-Roadmap detail
    // derived from the canonical archetype data (no extra DB columns required),
    // plus the agent-controlled `pipelineStatus` used to classify the card into
    // the Client Assessments vs Closed section (or hide abandoned/deleted rows).
    clientAssessmentDetail: list.map((c) => ({
      ...attachClientReport(c),
      pipelineStatus: derivePipelineStatus(c),
    })),
    matches,
    agentPaymentStatus,
    closings,
    settings: {
      accountEmail: agent?.email ?? null,
      supabaseConnected: true,
      oauth: { google: "Not connected", apple: "Not connected", email: "Enabled" },
    },
  };
}
