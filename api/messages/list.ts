import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  requireQueryParam,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { getAgentNotifications } from "../../backend/lib/messages.js";
import { requireAgent } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "messages/list";

/**
 * GET /api/messages/list?agentId=...&unreadOnly=true
 * Requires agent auth. An agent only sees their own notifications; admins may
 * pass any agentId.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    const profile = await requireAgent(req);
    let agentId: string;
    if (profile.role === "admin") {
      agentId = requireQueryParam(req, "agentId");
    } else if (profile.agentId) {
      agentId = profile.agentId;
    } else {
      throw new HttpError(403, "No agent profile is linked to this account.");
    }

    const unreadOnly = getQueryParam(req, "unreadOnly") === "true";
    try {
      const messages = await getAgentNotifications(agentId, { unreadOnly, limit: 100 });
      sendJson(res, 200, { messages });
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
