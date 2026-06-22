import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { getArchetypeReference } from "../../backend/lib/archetypes.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/archetype-reference";

/**
 * GET /api/reviewer/archetype-reference
 * Requires reviewer/admin auth. Returns the canonical approved archetype
 * reference (16 client + 16 agent) with summaries, key traits, and compatible
 * types. Pure canonical data — no Supabase reads, no client/agent records.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    await requireReviewer(req);

    const reference = getArchetypeReference();
    sendJson(res, 200, reference);
  });
}
