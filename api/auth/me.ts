import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, sendJson } from "../_lib/http.js";
import { getUserFromRequest } from "../../backend/lib/auth.js";
import { getRequiredEnvStatus } from "../../backend/lib/env.js";
import { getSupabaseAdmin, SupabaseConfigError } from "../../backend/lib/supabaseAdmin.js";

const ROUTE = "auth/me";

type EnvStatus = ReturnType<typeof getRequiredEnvStatus>;

/** Server-side log with safe fields only. Never logs tokens/keys/passwords. */
function logSafe(code: string, message: string, env: EnvStatus, area?: string): void {
  console.error(`[${ROUTE}]`, {
    code,
    message,
    area: area ?? null,
    hasSupabaseUrl: env.hasSupabaseUrl,
    hasSupabaseAnonKey: env.hasSupabaseAnonKey,
    hasSupabaseServiceRoleKey: env.hasSupabaseServiceRoleKey,
  });
}

/**
 * GET /api/auth/me, Protected (Authorization: Bearer <access_token>, no cookies).
 *
 * Crash-proof: the entire body is wrapped so the function ALWAYS returns JSON,
 * never a Vercel FUNCTION_INVOCATION_FAILED page. Env is read via non-throwing
 * helpers, and the Supabase client is built lazily inside a try/catch.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed. Expected GET.", code: "METHOD_NOT_ALLOWED" });
      return;
    }

    const env = getRequiredEnvStatus();
    const hasAuthorizationHeader = Boolean(
      req.headers["authorization"] || req.headers["Authorization"]
    );

    // 1) No bearer token at all (e.g. opening the URL directly).
    if (!hasAuthorizationHeader) {
      sendJson(res, 401, { error: "Authentication required.", code: "NO_AUTH_HEADER" });
      return;
    }

    // 2) Public config required to talk to Supabase.
    if (!env.hasSupabaseUrl || !env.hasSupabaseAnonKey) {
      logSafe("MISSING_SUPABASE_PUBLIC_CONFIG", "Supabase public config missing", env);
      sendJson(res, 500, {
        error: "Server auth is not configured",
        code: "MISSING_SUPABASE_PUBLIC_CONFIG",
        hasSupabaseUrl: env.hasSupabaseUrl,
        hasSupabaseAnonKey: env.hasSupabaseAnonKey,
      });
      return;
    }

    // 3) Service role key required to verify tokens server-side.
    if (!env.hasSupabaseServiceRoleKey) {
      logSafe("MISSING_SUPABASE_SERVICE_ROLE_KEY", "Service role key missing", env);
      sendJson(res, 500, {
        error: "Server auth is not configured",
        code: "MISSING_SUPABASE_SERVICE_ROLE_KEY",
        hasSupabaseServiceRoleKey: false,
      });
      return;
    }

    // 4) Validate the bearer token → Supabase user.
    let user: { id: string; email: string | null } | null;
    try {
      user = await getUserFromRequest(req);
    } catch (err) {
      if (err instanceof SupabaseConfigError) {
        logSafe(err.code, err.message, env);
        sendJson(res, 500, { error: "Server auth is not configured", code: err.code });
        return;
      }
      logSafe("SUPABASE_AUTH_LOOKUP_FAILED", err instanceof Error ? err.message : "unknown", env);
      sendJson(res, 500, {
        error: "Could not verify the session token.",
        code: "SUPABASE_AUTH_LOOKUP_FAILED",
      });
      return;
    }
    if (!user) {
      sendJson(res, 401, { error: "Authentication required.", code: "NO_VALID_SESSION" });
      return;
    }

    // 5) Build the admin client (lazy; may throw a typed config error).
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err) {
      const code = err instanceof SupabaseConfigError ? err.code : "SUPABASE_CLIENT_INIT_FAILED";
      logSafe(code, err instanceof Error ? err.message : "unknown", env);
      sendJson(res, 500, { error: "Server auth is not configured", code });
      return;
    }

    // 6) Profile lookup. Missing ROW → needsBootstrap (200). Query ERROR → 500.
    // Select * (not specific columns) so a drifted live DB missing an optional
    // column (e.g. full_name) can NEVER 500 the auth check and bounce a genuinely
    // signed-in agent back to the login page.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      logSafe("PROFILE_QUERY_FAILED", profileError.message, env, "public.profiles");
      sendJson(res, 500, {
        error: "Could not read your profile.",
        code: "PROFILE_QUERY_FAILED",
        area: "public.profiles",
      });
      return;
    }

    const role = profile?.role ?? null;

    // 7) Agent lookup (agent/admin only). Missing ROW → agent:null. ERROR → 500.
    let agent: Record<string, unknown> | null = null;
    if (role === "agent" || role === "admin") {
      // Select * so a missing optional agent column (schema drift) can't 500 the
      // auth check; we read each field defensively below.
      const { data: agentRow, error: agentError } = await supabase
        .from("agents")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (agentError) {
        logSafe("AGENT_QUERY_FAILED", agentError.message, env, "public.agents");
        sendJson(res, 500, {
          error: "Could not read your agent profile.",
          code: "AGENT_QUERY_FAILED",
          area: "public.agents",
        });
        return;
      }
      if (agentRow) {
        agent = {
          id: agentRow.id,
          profile_id: agentRow.profile_id,
          email: agentRow.email,
          display_name: agentRow.display_name,
          displayName: agentRow.display_name,
          publicToken: agentRow.public_assessment_token,
          archetype: agentRow.archetype,
          archetype_completed_at: agentRow.archetype_completed_at ?? null,
          archetypeCompletedAt: Boolean(agentRow.archetype_completed_at),
        };
      }
    }

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
  } catch (err) {
    // Absolute last resort, guarantee JSON instead of a runtime crash page.
    try {
      console.error(`[${ROUTE}] unexpected error:`, err instanceof Error ? err.message : "unknown");
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Unexpected server error.", code: "UNEXPECTED_ERROR" });
      }
    } catch {
      /* ignore */
    }
  }
}
