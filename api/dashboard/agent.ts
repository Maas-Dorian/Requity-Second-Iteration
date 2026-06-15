import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  requireQueryParam,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http";
import { getAgentDashboard } from "../../backend/lib/dashboard";
import { requireAgent } from "../../backend/lib/auth";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger";

const ROUTE = "dashboard/agent";

/**
 * GET /api/dashboard/agent?agentId=...
 * Requires agent auth. An agent may only load their own dashboard; admins may
 * load any agentId. Demo mode (NODE_ENV !== production) falls back to the query
 * param so the static demo keeps working locally.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    const profile = await requireAgent(req);
    let agentId: string;
    if (profile.role === "admin" || profile.demo) {
      agentId = requireQueryParam(req, "agentId");
    } else if (profile.agentId) {
      agentId = profile.agentId;
    } else {
      throw new HttpError(403, "No agent profile is linked to this account.");
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
