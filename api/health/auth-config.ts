import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http";
import { getEnv } from "../../backend/lib/env";
import { getSupabaseAdmin } from "../../backend/lib/supabaseAdmin";

/**
 * GET /api/health/auth-config
 * Booleans only — safe to call from anywhere. Reports which auth env vars are
 * present and whether the server can reach Supabase with the service role key.
 * NEVER returns any key, token, or secret value.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    const e = getEnv();

    let canReachSupabase = false;
    if (e.hasSupabaseUrl && e.hasSupabaseServiceRoleKey) {
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
      hasSupabaseUrl: e.hasSupabaseUrl,
      hasSupabaseAnonKey: e.hasSupabaseAnonKey,
      hasSupabaseServiceRoleKey: e.hasSupabaseServiceRoleKey,
      canReachSupabase,
    });
  });
}
