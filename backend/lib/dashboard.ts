import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { env } from "./env.js";
import { getAgentNotifications, type NotificationRecord } from "./messages.js";
import { getAgentAssessmentActivity, type AgentAssessmentActivity } from "./analytics.js";

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
   * Null when the analytics query fails — the rest of the dashboard still loads
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
  settings: {
    accountEmail: string | null;
    supabaseConnected: boolean;
    oauth: { google: string; apple: string; email: string };
  };
};

/**
 * Build an agent's public assessment links from their token.
 *  - assessmentLink: shareable link (source `agent_link`)
 *  - qrLink: link encoded in the QR code (source `qr`)
 * Both attach scanning/visiting clients directly to the agent — never the
 * reviewer queue. Returns empty strings when the agent has no token.
 */
export function buildAgentAssessmentLinks(
  token: string | null | undefined,
  frontendUrl?: string
): { assessmentLink: string; qrLink: string } {
  const base = (frontendUrl || env.frontendUrl).replace(/\/$/, "");
  const t = token ?? "";
  return {
    assessmentLink: t ? `${base}/client/assessment.html?agent=${t}&source=agent_link` : "",
    qrLink: t ? `${base}/client/assessment.html?agent=${t}&source=qr` : "",
  };
}

/** Look up an agent's public assessment links by agent id. */
export async function getAgentAssessmentLinks(
  agentId: string,
  options: { frontendUrl?: string } = {}
): Promise<{ assessmentLink: string; qrLink: string }> {
  const token = await ensureAgentPublicToken(agentId);
  return buildAgentAssessmentLinks(token, options.frontendUrl);
}

export async function getAgentDashboard(
  agentId: string,
  options: { frontendUrl?: string } = {}
): Promise<AgentDashboard> {
  const supabase = getSupabaseAdmin();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, display_name, email, archetype, public_assessment_token")
    .eq("id", agentId)
    .maybeSingle();

  // Backfill a public token if this agent has none, so the link/QR always work.
  const publicToken =
    agent?.public_assessment_token ?? (agent ? await ensureAgentPublicToken(agentId) : null);

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("*, assessments(*)")
    .eq("assigned_agent_id", agentId)
    .order("created_at", { ascending: false });
  if (clientsError) throw new Error(`getAgentDashboard clients failed: ${clientsError.message}`);

  const messages = await getAgentNotifications(agentId, { limit: 50 });

  const { assessmentLink, qrLink } = buildAgentAssessmentLinks(
    publicToken,
    options.frontendUrl
  );

  const list = clients ?? [];
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

  const recentClients = list.slice(0, 8).map((c) => ({
    id: c.id,
    name: c.full_name,
    archetype: c.archetype ?? null,
    status: c.status,
    source: c.source,
    updatedAt: c.updated_at ?? c.created_at,
  }));

  return {
    agent: agent
      ? {
          id: agent.id,
          displayName: agent.display_name,
          email: agent.email,
          archetype: agent.archetype ?? null,
        }
      : null,
    assessmentLink,
    qrLink,
    assessmentActivity: activity,
    weeklyActivity,
    clientFlowCounts: flow,
    recentClients,
    messages,
    clientAssessmentDetail: list,
    settings: {
      accountEmail: agent?.email ?? null,
      supabaseConnected: true,
      oauth: { google: "Not connected", apple: "Not connected", email: "Enabled" },
    },
  };
}
