import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http";
import { requireAgent } from "../../backend/lib/auth";
import { getAgentAssessmentActivity } from "../../backend/lib/analytics";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger";

const ROUTE = "dashboard/agent-activity";

/**
 * GET /api/dashboard/agent-activity
 * Requires agent auth. Returns lightweight last-N-days assessment activity for
 * the signed-in agent (started/completed counts per day). Admins may target a
 * specific agent via ?agentId=; normal agents can only see their own analytics.
 *
 * Query:
 *   - days  optional, default 7, max 30
 *   - agentId  admin-only override
 *
 * The dashboard route also embeds this payload (see GET /api/dashboard/agent →
 * weeklyActivity) so the dashboard makes a single request; this route exists for
 * explicit/standalone use (e.g. a custom range).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    const profile = await requireAgent(req);
    let agentId: string;
    if (profile.role === "admin") {
      agentId = getQueryParam(req, "agentId") || profile.agentId || "";
      if (!agentId) throw new HttpError(400, "An agentId is required for admin requests.");
    } else if (profile.agentId) {
      agentId = profile.agentId;
    } else {
      throw new HttpError(403, "No agent profile is linked to this account.");
    }

    const daysRaw = getQueryParam(req, "days");
    const days = daysRaw ? Number.parseInt(daysRaw, 10) : 7;

    try {
      const activity = await getAgentAssessmentActivity(agentId, Number.isNaN(days) ? 7 : days);
      sendJson(res, 200, { activity });
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
