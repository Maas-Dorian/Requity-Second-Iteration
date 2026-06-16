import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http";
import { getUserFromRequest } from "../../backend/lib/auth";
import { getEnv } from "../../backend/lib/env";
import { getSupabaseAdmin } from "../../backend/lib/supabaseAdmin";

const ROUTE = "auth/me";

/**
 * GET /api/auth/me
 * Protected — requires `Authorization: Bearer <access_token>` (no cookies).
 *
 * Resilient by design:
 *  - Missing server env → 500 with a clear code (no secret values).
 *  - Missing/invalid token → 401 only.
 *  - Missing profile/agent ROW → 200 with profile/agent null (not an error).
 *  - A failing query (e.g. missing table/column) → 500 with a safe diagnostic.
 *
 * Logs only booleans/status — never tokens, keys, or passwords.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");

    const e = getEnv();
    const hasAuthorizationHeader = Boolean(
      req.headers["authorization"] || req.headers["Authorization"]
    );

    console.debug(`[${ROUTE}] config`, {
      hasAuthorizationHeader,
      hasSupabaseUrl: e.hasSupabaseUrl,
      hasSupabaseAnonKey: e.hasSupabaseAnonKey,
      hasSupabaseServiceRoleKey: e.hasSupabaseServiceRoleKey,
    });

    // 1) The server can only verify tokens with URL + service role key.
    if (!e.hasSupabaseUrl || !e.hasSupabaseServiceRoleKey) {
      sendJson(res, 500, {
        error: "Server auth is not configured",
        code: "MISSING_SUPABASE_SERVICE_ROLE_KEY",
        hasSupabaseUrl: e.hasSupabaseUrl,
        hasSupabaseServiceRoleKey: e.hasSupabaseServiceRoleKey,
      });
      return;
    }

    // 2) Validate the bearer token → Supabase user.
    let user;
    try {
      user = await getUserFromRequest(req);
    } catch (err) {
      console.error(`[${ROUTE}] auth lookup failed:`, err instanceof Error ? err.message : err);
      sendJson(res, 500, {
        error: "Could not verify the session token.",
        code: "SUPABASE_AUTH_LOOKUP_FAILED",
      });
      return;
    }
    console.debug(`[${ROUTE}] authUserLookupStatus`, { found: Boolean(user) });
    if (!user) {
      sendJson(res, 401, { error: "Authentication required.", code: "NO_VALID_SESSION" });
      return;
    }

    const supabase = getSupabaseAdmin();

    // 3) Profile lookup. A missing ROW is fine (needsBootstrap); a query ERROR
    //    (e.g. the table doesn't exist) is a real, surfaced server problem.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    console.debug(`[${ROUTE}] profileLookupStatus`, {
      status: profileError ? "error" : profile ? "found" : "missing",
    });

    if (profileError) {
      sendJson(res, 500, {
        error: "Could not read your profile.",
        code: "PROFILE_QUERY_FAILED",
        area: "public.profiles",
        detail: profileError.message,
      });
      return;
    }

    const role = profile?.role ?? null;

    // 4) Agent lookup (only for agent/admin). Missing ROW → agent:null (fine).
    let agent: Record<string, unknown> | null = null;
    let agentLookupStatus = "skipped";
    if (role === "agent" || role === "admin") {
      const { data: agentRow, error: agentError } = await supabase
        .from("agents")
        .select(
          "id, profile_id, email, display_name, archetype, archetype_completed_at, public_assessment_token"
        )
        .eq("profile_id", user.id)
        .maybeSingle();

      if (agentError) {
        console.debug(`[${ROUTE}] agentLookupStatus`, { status: "error" });
        sendJson(res, 500, {
          error: "Could not read your agent profile.",
          code: "AGENT_QUERY_FAILED",
          area: "public.agents",
          detail: agentError.message,
        });
        return;
      }
      agentLookupStatus = agentRow ? "found" : "missing";
      if (agentRow) {
        agent = {
          id: agentRow.id,
          profile_id: agentRow.profile_id,
          email: agentRow.email,
          // Both casings: snake_case for the documented shape, camelCase for
          // existing frontend code that already reads displayName.
          display_name: agentRow.display_name,
          displayName: agentRow.display_name,
          publicToken: agentRow.public_assessment_token,
          archetype: agentRow.archetype,
          archetype_completed_at: agentRow.archetype_completed_at ?? null,
          archetypeCompletedAt: Boolean(agentRow.archetype_completed_at),
        };
      }
    }
    console.debug(`[${ROUTE}] agentLookupStatus`, { status: agentLookupStatus });

    sendJson(res, 200, {
      user: { id: user.id, email: user.email },
      profile: profile
        ? {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name ?? null,
            role: profile.role,
          }
        : null,
      role,
      agent,
      needsBootstrap: !profile,
    });
  });
}
