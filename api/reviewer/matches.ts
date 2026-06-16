import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { listReviewerQueue } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/matches";

/**
 * GET /api/reviewer/matches
 * Requires reviewer/admin auth. Returns pending reviewer-queue clients with
 * ranked recommended agents.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    await requireReviewer(req);

    try {
      const queue = await listReviewerQueue();
      sendJson(res, 200, { queue });
    } catch (error) {
      logSupabaseError(ROUTE, error);
      throw error;
    }
  });
}
