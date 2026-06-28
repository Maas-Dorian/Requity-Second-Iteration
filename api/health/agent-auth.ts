import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdmin, SupabaseConfigError } from "../../backend/lib/supabaseAdmin.js";

/**
 * GET /api/health/agent-auth
 *
 * Safe diagnostic for the agent auth/profile/agent table flow. Returns BOOLEANS
 * ONLY, never rows, emails, tokens, keys, or any PII. Verifies the service-role
 * client can read profiles + agents and that the columns the auth flow depends
 * on are present (so schema drift is caught before it breaks sign-in).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");

    let canReadProfiles = false;
    let canReadAgents = false;
    let profileColumnsPresent = false;
    let agentColumnsPresent = false;

    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (error) {
      const configured = !(error instanceof SupabaseConfigError);
      sendJson(res, 200, {
        ok: false,
        provider: "supabase",
        configured,
        canReachSupabase: false,
        profilesReachable: false,
        agentsReachable: false,
        canReadProfiles: false,
        canReadAgents: false,
        canBootstrapAgent: false,
        hasBootstrapEndpoint: true,
        requiredColumnsPresent: false,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // profiles: required columns the auth flow reads.
    try {
      const { error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .limit(1);
      if (!error) {
        canReadProfiles = true;
        profileColumnsPresent = true;
      } else {
        // Distinguish "table readable but column missing" from "cannot read".
        const { error: baseError } = await supabase.from("profiles").select("id").limit(1);
        canReadProfiles = !baseError;
        profileColumnsPresent = false;
      }
    } catch {
      /* leave false */
    }

    // agents: required columns the auth + dashboard flow read.
    try {
      const { error } = await supabase
        .from("agents")
        .select("id, profile_id, email, display_name, archetype, public_assessment_token")
        .limit(1);
      if (!error) {
        canReadAgents = true;
        agentColumnsPresent = true;
      } else {
        const { error: baseError } = await supabase.from("agents").select("id").limit(1);
        canReadAgents = !baseError;
        agentColumnsPresent = false;
      }
    } catch {
      /* leave false */
    }

    const requiredColumnsPresent = profileColumnsPresent && agentColumnsPresent;
    // Bootstrap can run when both tables are reachable (service role upserts both).
    const canBootstrapAgent = canReadProfiles && canReadAgents;

    sendJson(res, 200, {
      ok: canReadProfiles && canReadAgents && requiredColumnsPresent,
      provider: "supabase",
      configured: true,
      canReachSupabase: canReadProfiles || canReadAgents,
      profilesReachable: canReadProfiles,
      agentsReachable: canReadAgents,
      canReadProfiles,
      canReadAgents,
      canBootstrapAgent,
      hasBootstrapEndpoint: true,
      requiredColumnsPresent,
      timestamp: new Date().toISOString(),
    });
  });
}
