import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, sendJson } from "../_lib/http.js";
import { getRequiredEnvStatus } from "../../backend/lib/env.js";
import { getSupabaseAdmin } from "../../backend/lib/supabaseAdmin.js";

/**
 * GET /api/health/supabase
 * Verifies the service-role connection with a tiny count-only query against
 * `profiles`. Crash-proof: always returns JSON (HTTP 200) with ok true/false
 * and a safe message. Never exposes keys or row data.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const env = getRequiredEnvStatus();

    if (!env.hasSupabaseUrl || !env.hasSupabaseServiceRoleKey) {
      sendJson(res, 200, {
        ok: false,
        configured: false,
        error: "Supabase is not fully configured (SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY missing).",
        hasSupabaseUrl: env.hasSupabaseUrl,
        hasSupabaseServiceRoleKey: env.hasSupabaseServiceRoleKey,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();
      const { error, count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .limit(1);

      if (error) {
        sendJson(res, 200, {
          ok: false,
          configured: true,
          error: error.message,
          hint: "Did you run backend/supabase/schema.sql on this project?",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        configured: true,
        profilesReachable: true,
        profileCount: typeof count === "number" ? count : null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      sendJson(res, 200, {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Unknown Supabase error.",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    try {
      console.error("[health/supabase] unexpected error:", err instanceof Error ? err.message : "unknown");
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Unexpected server error.", code: "UNEXPECTED_ERROR" });
      }
    } catch {
      /* ignore */
    }
  }
}
