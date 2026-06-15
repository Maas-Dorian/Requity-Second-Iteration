import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http";
import { getEnv } from "../../backend/lib/env";
import { getSupabaseAdmin } from "../../backend/lib/supabaseAdmin";

/**
 * GET /api/health/supabase
 * Verifies the service-role connection by running a tiny, safe query against
 * `profiles` (count only, limit 1). Returns ok true/false and a safe error
 * message. Never exposes keys or row data.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    const e = getEnv();

    if (!e.hasSupabaseUrl || !e.hasSupabaseServiceRoleKey) {
      sendJson(res, 200, {
        ok: false,
        configured: false,
        error: "Supabase is not fully configured (SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY missing).",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();
      // HEAD + count: no row data returned, just confirms the table is reachable.
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
  });
}
