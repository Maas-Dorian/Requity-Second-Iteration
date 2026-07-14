import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  assertPayloadSize,
  sendJson,
} from "../_lib/http.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { revokeComplimentaryAccess, accessStatusLabel } from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/revoke-agent-complimentary-access";

/**
 * POST /api/reviewer/revoke-agent-complimentary-access
 * Body: { agentId }
 * Requires reviewer/admin auth. Revokes complimentary access. An agent with a
 * confirmed Stripe payment is restored to paid; a grandfathered agent is
 * restored to grandfathered; otherwise payment becomes required again and the
 * dashboard is blocked. History is never deleted.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);
    const body = getJsonBody(req);
    const agentId = requireString(body, "agentId");

    try {
      const access = await revokeComplimentaryAccess({
        agentId,
        reviewerProfileId: reviewer.profileId,
      });
      sendJson(res, 200, {
        ok: true,
        agentId,
        accessStatus: access.accessStatus,
        accessStatusLabel: accessStatusLabel(access.accessStatus),
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
