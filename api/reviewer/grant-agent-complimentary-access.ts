import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  optionalString,
  assertPayloadSize,
  sendJson,
} from "../_lib/http.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { grantComplimentaryAccess, accessStatusLabel } from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/grant-agent-complimentary-access";

/**
 * POST /api/reviewer/grant-agent-complimentary-access
 * Body: { agentId, reason, note? }
 * Requires reviewer/admin auth (server-enforced; agents can never grant
 * themselves access). Grants complimentary platform access, completely
 * bypassing the $50 Stripe payment, with a full audit trail (who, when, why).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);
    const body = getJsonBody(req);
    const agentId = requireString(body, "agentId");
    const reason = requireString(body, "reason");
    const note = optionalString(body, "note") ?? null;

    try {
      const access = await grantComplimentaryAccess({
        agentId,
        reviewerProfileId: reviewer.profileId,
        reason: reason.slice(0, 500),
        note: note ? note.slice(0, 1000) : null,
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
