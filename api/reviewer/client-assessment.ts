import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { getReviewerClientAssessment } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/client-assessment";

/**
 * GET /api/reviewer/client-assessment?clientId=... | ?leadId=...
 *
 * Requires reviewer/admin auth (enforced server-side). Returns the assessment
 * detail for ONE paired client or lead: transaction, markets, communication
 * style, archetype, top needs, appreciation style (readable label), and the
 * open-ended expectations. Loaded on demand by the Paired Clients
 * "Client assessment" dropdown.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    await requireReviewer(req);

    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : null;
    const leadId = typeof req.query.leadId === "string" ? req.query.leadId : null;

    try {
      const result = await getReviewerClientAssessment({ clientId, leadId });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { clientId, leadId });
      throw error;
    }
  });
}
