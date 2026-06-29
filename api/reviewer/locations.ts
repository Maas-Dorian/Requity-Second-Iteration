import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
} from "../_lib/http.js";
import { listReviewerLocations } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/locations";

/**
 * GET /api/reviewer/locations?q=&city=&state=&status=&transaction=&limit=&offset=
 *
 * Requires reviewer/admin auth. Groups clients + agents by normalized market and
 * returns bounded result sets only (heavy filtering/grouping is backend-side so
 * the browser never receives or filters giant arrays).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);
    await requireReviewer(req);

    const limitRaw = getQueryParam(req, "limit");
    const offsetRaw = getQueryParam(req, "offset");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const offset = offsetRaw ? Number(offsetRaw) : undefined;

    try {
      const result = await listReviewerLocations({
        q: getQueryParam(req, "q") ?? null,
        city: getQueryParam(req, "city") ?? null,
        state: getQueryParam(req, "state") ?? null,
        status: getQueryParam(req, "status") ?? null,
        transaction: getQueryParam(req, "transaction") ?? null,
        eligibility: getQueryParam(req, "eligibility") ?? null,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      logSupabaseError(ROUTE, error);
      throw error;
    }
  });
}
