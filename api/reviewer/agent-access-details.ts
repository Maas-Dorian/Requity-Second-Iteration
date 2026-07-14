import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  requireQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import {
  getAgentAccessRecord,
  accessStatusLabel,
  canAgentAccessPlatform,
} from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/agent-access-details";

/**
 * GET /api/reviewer/agent-access-details?agentId=...
 * Requires reviewer/admin auth. Returns one agent's platform access record for
 * the Agent Control Center: access status, Stripe payment facts (references
 * and amount only, never card data), grandfathered/complimentary audit fields.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    await requireReviewer(req);
    const agentId = requireQueryParam(req, "agentId");

    try {
      const access = await getAgentAccessRecord(agentId);
      if (!access) throw new HttpError(404, "Agent not found.", "AGENT_NOT_FOUND");
      sendJson(res, 200, {
        ok: true,
        agentId: access.agentId,
        displayName: access.displayName,
        email: access.email,
        accessStatus: access.accessStatus,
        accessStatusLabel: accessStatusLabel(access.accessStatus),
        canAccess: canAgentAccessPlatform(access) || access.legacySchema,
        paymentRequired: access.paymentRequired && !access.legacySchema,
        accessGrantedAt: access.accessGrantedAt,
        accessGrantReason: access.accessGrantReason,
        grandfathered: Boolean(access.grandfatheredAt),
        grandfatheredAt: access.grandfatheredAt,
        complimentaryAccess: access.complimentaryAccess,
        complimentaryAccessGrantedAt: access.complimentaryAccessGrantedAt,
        complimentaryAccessNote: access.complimentaryAccessNote,
        stripePaymentStatus: access.stripePaymentStatus,
        stripePaidAt: access.stripePaidAt,
        stripeAmountPaid: access.stripeAmountPaid,
        stripeCurrency: access.stripeCurrency,
        stripeCheckoutSessionId: access.stripeCheckoutSessionId,
        stripeCustomerId: access.stripeCustomerId,
        accessSchemaReady: !access.legacySchema,
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
