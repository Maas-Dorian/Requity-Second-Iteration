import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  optionalString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { assignReviewerMatch } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/approve-match";

/**
 * POST /api/reviewer/approve-match
 * Body: { clientId, agentId, score?, reason?, reviewerId? }
 *
 * Requires reviewer/admin auth. Approves the match, assigns the client to the
 * agent (shown with the "REQUITY Client Match" badge), creates the exact
 * reviewer-match notification, and sends + records the Brevo reviewer match email.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);

    const body = getJsonBody(req);
    const clientId = requireString(body, "clientId");
    const agentId = requireString(body, "agentId");

    let score: number | undefined;
    if (body.score !== undefined) {
      const parsed = Number(body.score);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new HttpError(400, "Invalid score. Expected a number between 0 and 100.");
      }
      score = Math.round(parsed);
    }

    try {
      const result = await assignReviewerMatch({
        clientId,
        agentId,
        score,
        reason: optionalString(body, "reason"),
        reviewerId: optionalString(body, "reviewerId") ?? reviewer.profileId,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { clientId, agentId });
      throw error;
    }
  });
}
