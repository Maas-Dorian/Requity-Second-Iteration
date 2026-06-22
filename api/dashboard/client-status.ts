import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  requireEnum,
  sendJson,
} from "../_lib/http.js";
import {
  updateClientPipelineStatus,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from "../../backend/lib/dashboard.js";
import { requireAgent } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "dashboard/client-status";

/**
 * POST /api/dashboard/client-status
 * Requires agent auth. Update one client's agent-controlled pipeline status.
 * Body: { clientId, status: "potential"|"active"|"under_contract"|"closed" }
 * The agent must be assigned to the client (admins may update any). Returns the
 * updated { clientId, status }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const profile = await requireAgent(req);

    const body = getJsonBody(req);
    const clientId = requireString(body, "clientId");
    const status = requireEnum<PipelineStatus>(body, "status", PIPELINE_STATUSES);

    try {
      const result = await updateClientPipelineStatus({
        clientId,
        agentId: profile.agentId,
        isAdmin: profile.role === "admin",
        status,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { clientId });
      throw error;
    }
  });
}
