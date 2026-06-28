import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { getReviewerMatchSuggestions } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/match-suggestions";

/**
 * GET /api/reviewer/match-suggestions?leadId=...&clientId=...&limit=
 *
 * Requires reviewer/admin auth. Returns the top suggested agents for a queued
 * client/lead, ordered by inside-radius, blended total score, then location
 * score. All proximity/matching math is backend-side.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);
    await requireReviewer(req);

    const clientId = getQueryParam(req, "clientId") ?? null;
    const leadId = getQueryParam(req, "leadId") ?? null;
    if (!clientId && !leadId) {
      throw new HttpError(400, "A clientId or leadId is required.");
    }
    const limitRaw = getQueryParam(req, "limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    try {
      const result = await getReviewerMatchSuggestions({
        clientId,
        leadId,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { hasClientId: Boolean(clientId), hasLeadId: Boolean(leadId) });
      throw error;
    }
  });
}
