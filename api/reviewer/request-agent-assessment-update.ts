import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
} from "../_lib/http.js";
import { requestAgentAssessmentUpdate } from "../../backend/lib/reviewerAgents.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/request-agent-assessment-update";

/**
 * POST /api/reviewer/request-agent-assessment-update
 * Body: { agentId }
 *
 * Reviewer/admin only. Flags the agent's account (needs_assessment_update),
 * which shows an update banner on the agent dashboard, and emails the agent a
 * link to the login-gated assessment page. Agents can never set this flag for
 * themselves or other agents; the flag clears automatically when the agent
 * submits a new assessment.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);
    const body = getJsonBody(req);
    const agentId = requireString(body, "agentId");

    try {
      const result = await requestAgentAssessmentUpdate(agentId);
      console.log("REVIEWER_ASSESSMENT_UPDATE_REQUESTED", {
        reviewerProfileId: reviewer.profileId,
        agentId,
        emailed: result.emailed,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
