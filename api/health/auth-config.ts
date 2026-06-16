import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, sendJson } from "../_lib/http.js";
import { getRequiredEnvStatus } from "../../backend/lib/env.js";
import { getSupabaseAdmin } from "../../backend/lib/supabaseAdmin.js";

/**
 * GET /api/health/auth-config
 * Booleans only — safe to call from anywhere, never crashes, never returns a
 * secret value. Reports which auth/integration env vars are present and whether
 * the server can reach Supabase with the service role key.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const env = getRequiredEnvStatus();

    let canReachSupabase = false;
    if (env.hasSupabaseUrl && env.hasSupabaseServiceRoleKey) {
      try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .limit(1);
        canReachSupabase = !error;
      } catch {
        canReachSupabase = false;
      }
    }

    sendJson(res, 200, {
      hasSupabaseUrl: env.hasSupabaseUrl,
      hasSupabaseAnonKey: env.hasSupabaseAnonKey,
      hasSupabaseServiceRoleKey: env.hasSupabaseServiceRoleKey,
      hasBrevoApiKey: env.hasBrevoApiKey,
      canReachSupabase,
    });
  } catch (err) {
    try {
      console.error("[health/auth-config] unexpected error:", err instanceof Error ? err.message : "unknown");
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Unexpected server error.", code: "UNEXPECTED_ERROR" });
      }
    } catch {
      /* ignore */
    }
  }
}
