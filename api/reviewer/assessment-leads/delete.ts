import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  requireQueryParam,
  sendJson,
} from "../../_lib/http.js";
import { deleteAssessmentLead } from "../../../backend/lib/assessmentLeads.js";
import { requireReviewer } from "../../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../../backend/lib/logger.js";

const ROUTE = "reviewer/assessment-leads/delete";

/**
 * DELETE /api/reviewer/assessment-leads/delete?id=<leadId>
 *
 * Requires an authenticated reviewer/admin session. Permanently deletes the
 * given assessment lead so it disappears from the reviewer page for good.
 * Never deletes agents/profiles. Returns { ok: true, deletedId }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "DELETE");
    logApiStart(ROUTE);

    await requireReviewer(req);

    const id = requireQueryParam(req, "id");

    try {
      const result = await deleteAssessmentLead(id);
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { leadId: id });
      throw error;
    }
  });
}
