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
import { markPaymentRequiredByReviewer, accessStatusLabel } from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/reset-agent-payment-requirement";

/**
 * POST /api/reviewer/reset-agent-payment-requirement
 * Body: { agentId }
 * Requires reviewer/admin auth. Explicitly puts an agent back into
 * payment_required. Refused for grandfathered agents and for agents with a
 * confirmed Stripe payment (refund those in Stripe instead; the webhook then
 * updates access automatically).
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
      const access = await markPaymentRequiredByReviewer({
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
