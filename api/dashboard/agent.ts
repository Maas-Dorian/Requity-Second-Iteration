import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { getAgentDashboard } from "../../backend/lib/dashboard.js";
import { requireAgent } from "../../backend/lib/auth.js";
import { requireAgentPlatformAccess } from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "dashboard/agent";

/**
 * GET /api/dashboard/agent?agentId=...
 * Requires agent auth. An agent may only load their own dashboard; admins may
 * load any agentId via the query param.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");

    // Identity comes from the authenticated session, agentId is NOT required.
    // Admins may optionally pass ?agentId= to view another agent.
    const profile = await requireAgent(req);
    // Hard access gate: unpaid new agents cannot load the dashboard. Allowed
    // statuses only: grandfathered, paid, complimentary (admins bypass).
    await requireAgentPlatformAccess(profile);
    const overrideId = getQueryParam(req, "agentId");
    const agentId =
      profile.role === "admin" && overrideId ? overrideId : profile.agentId;

    logApiStart(ROUTE, { hasAuthHeader: true, resolvedAgentId: !!agentId, isAdmin: profile.role === "admin" });

    if (!agentId) {
      throw new HttpError(404, "Agent profile not found.", "AGENT_NOT_FOUND");
    }

    const frontendUrl = getQueryParam(req, "frontendUrl");
    try {
      const dashboard = await getAgentDashboard(agentId, { frontendUrl });
      sendJson(res, 200, dashboard);
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
