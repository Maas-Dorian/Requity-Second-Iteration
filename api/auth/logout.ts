import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { logApiStart } from "../../backend/lib/logger.js";

/**
 * POST /api/auth/logout
 * No-op convenience endpoint. Supabase sign-out happens client-side by clearing
 * the stored session (and optionally calling Supabase /auth/v1/logout). Provided
 * so the frontend has a stable endpoint if it prefers a server round-trip.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart("auth/logout");
    sendJson(res, 200, { ok: true });
  });
}
