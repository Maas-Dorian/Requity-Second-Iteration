import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
} from "../_lib/http.js";
import { unmatchReviewerMatch } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/unmatch";

/**
 * POST /api/reviewer/unmatch
 * Body: { matchId }
 *
 * Reviewer/admin only. Removes the agent from ONE active match by superseding
 * it (status = superseded). Nothing is deleted: the match moves to history and
 * the client record stays available for review and re-matching. Other active
 * lanes for the same client are never touched.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);
    const body = getJsonBody(req);
    const matchId = requireString(body, "matchId");

    try {
      const result = await unmatchReviewerMatch(matchId);
      console.log("REVIEWER_UNMATCH", {
        reviewerProfileId: reviewer.profileId,
        matchId,
        matchLane: result.matchLane,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { matchId });
      throw error;
    }
  });
}
