import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { updateWithSchemaFallback } from "./supabaseWrite.js";

/**
 * Reviewer soft-delete (archive) actions (Part 6).
 *
 * Reviewers can remove agents, paired clients, and up-for-review clients from
 * their active views. Nothing is ever physically deleted:
 *  - agents get archived_at = now() (they disappear from suggestions and
 *    location views, but historical match_recommendations rows are kept),
 *  - clients get status = 'archived' plus archived_at = now(),
 *  - assessment_leads get archived_at = now().
 * email_events, match history, and assessment answers are never touched.
 */

export type ArchiveClientScope = "paired" | "up_for_review" | "closed" | "any";

export class ArchiveTargetNotFoundError extends Error {
  status = 404;
  constructor(message: string) {
    super(message);
    this.name = "ArchiveTargetNotFoundError";
  }
}

/** Soft-delete an agent. Validates the agent exists first. */
export async function archiveAgentByReviewer(agentId: string): Promise<{
  ok: true;
  agentId: string;
  archived: true;
}> {
  const supabase = getSupabaseAdmin();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(`archiveAgent lookup failed: ${error.message}`);
  if (!agent) throw new ArchiveTargetNotFoundError("Agent not found.");

  const now = new Date().toISOString();
  // archived_at is required: without it (pre-migration schema) the archive
  // would be a silent no-op, so we surface a clear error instead.
  await updateWithSchemaFallback(
    "agents",
    { archived_at: now, updated_at: now },
    { column: "id", value: agentId },
    { required: ["archived_at"] }
  );
  console.log("REVIEWER_AGENT_ARCHIVED", { agentId });
  return { ok: true, agentId, archived: true };
}

export type ArchiveClientParams = {
  clientId?: string | null;
  leadId?: string | null;
  scope?: ArchiveClientScope;
};

/**
 * Soft-delete a client and/or reviewer lead. Either id may be supplied (both
 * when they are linked). Match history, email events, and assessment answers
 * are always kept.
 */
export async function archiveClientByReviewer(params: ArchiveClientParams): Promise<{
  ok: true;
  clientId: string | null;
  leadId: string | null;
  scope: ArchiveClientScope;
  archived: true;
}> {
  const supabase = getSupabaseAdmin();
  const clientId = (params.clientId ?? "").trim() || null;
  const leadId = (params.leadId ?? "").trim() || null;
  const scope: ArchiveClientScope = params.scope ?? "any";
  if (!clientId && !leadId) {
    throw new Error("archiveClientByReviewer requires a clientId or leadId.");
  }

  const now = new Date().toISOString();
  let archivedSomething = false;

  if (clientId) {
    const { data: client, error } = await supabase
      .from("clients")
      .select("id, email")
      .eq("id", clientId)
      .maybeSingle();
    if (error) throw new Error(`archiveClient lookup failed: ${error.message}`);
    if (!client) throw new ArchiveTargetNotFoundError("Client not found.");
    // status = 'archived' exists in the assessment_status enum, so the client
    // leaves all active views even before migration 0011 adds archived_at.
    await updateWithSchemaFallback(
      "clients",
      { status: "archived", archived_at: now, updated_at: now },
      { column: "id", value: clientId },
      { required: ["status"] }
    );
    archivedSomething = true;

    // Also archive the completed lead rows for the same email so the client
    // does not resurface through the lead-based queue fallback (best effort).
    const email = (client.email ?? "").trim().toLowerCase();
    if (email) {
      try {
        await updateWithSchemaFallback(
          "assessment_leads",
          { archived_at: now, updated_at: now },
          { column: "email", value: email },
          { required: ["archived_at"] }
        );
      } catch {
        /* pre-migration schema: the clients row is archived, which is enough */
      }
    }
  }

  if (leadId) {
    const { data: lead, error } = await supabase
      .from("assessment_leads")
      .select("id")
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error(`archiveLead lookup failed: ${error.message}`);
    if (!lead && !archivedSomething) throw new ArchiveTargetNotFoundError("Lead not found.");
    if (lead) {
      await updateWithSchemaFallback(
        "assessment_leads",
        { archived_at: now, updated_at: now },
        { column: "id", value: leadId },
        { required: ["archived_at"] }
      );
      archivedSomething = true;
    }
  }

  console.log("REVIEWER_CLIENT_ARCHIVED", {
    hasClientId: Boolean(clientId),
    hasLeadId: Boolean(leadId),
    scope,
  });
  return { ok: true, clientId, leadId, scope, archived: true };
}
