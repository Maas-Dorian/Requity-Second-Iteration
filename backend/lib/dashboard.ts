import { getSupabaseAdmin } from "./supabaseAdmin";
import { env } from "./env";
import { getAgentNotifications, type NotificationRecord } from "./messages";

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

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("*, assessments(*)")
    .eq("assigned_agent_id", agentId)
    .order("created_at", { ascending: false });
  if (clientsError) throw new Error(`getAgentDashboard clients failed: ${clientsError.message}`);

  const messages = await getAgentNotifications(agentId, { limit: 50 });

  const base = (options.frontendUrl || env.frontendUrl).replace(/\/$/, "");
  const token = agent?.public_assessment_token ?? "";
  const assessmentLink = token
    ? `${base}/client/assessment.html?agent=${token}&source=agent_link`
    : "";
  const qrLink = token
    ? `${base}/client/assessment.html?agent=${token}&source=qr`
    : "";

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
