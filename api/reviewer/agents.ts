import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
} from "../_lib/http.js";
import { archiveAgentByReviewer } from "../../backend/lib/reviewerArchive.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/agents";

/**
 * DELETE /api/reviewer/agents
 * Body: { agentId }
 *
 * Requires reviewer/admin auth. Soft-deletes (archives) an agent: they are
 * removed from reviewer matching, suggestions, and location views, but their
 * historical match records, email events, and assessment data are kept.
 * Never a hard delete.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "DELETE");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);

    const body = getJsonBody(req);
    const agentId = requireString(body, "agentId");

    try {
      const result = await archiveAgentByReviewer(agentId);
      console.log("REVIEWER_AGENT_DELETE", {
        reviewerProfileId: reviewer.profileId,
        agentId,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
