import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "./_lib/http";
import { getEnv } from "../backend/lib/env";

/**
 * GET /api/health
 * Liveness + environment configuration snapshot. Returns ONLY presence booleans
 * — never any secret value. Safe to call publicly to verify a deployment.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    const e = getEnv();
    sendJson(res, 200, {
      ok: true,
      environment: e.environment,
      hasSupabaseUrl: e.hasSupabaseUrl,
      hasSupabaseAnonKey: e.hasSupabaseAnonKey,
      // Server-side-only presence signal (boolean, not the value).
      hasSupabaseServiceRoleKey: e.hasSupabaseServiceRoleKey,
      hasBrevoApiKey: e.hasBrevoApiKey,
      hasFrontendUrl: e.hasFrontendUrl,
      timestamp: new Date().toISOString(),
    });
  });
}
