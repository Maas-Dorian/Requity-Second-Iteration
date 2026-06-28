import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  optionalString,
  requireEnum,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import {
  updateClientStatusByReviewer,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from "../../backend/lib/dashboard.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/client-status";

/**
 * PATCH /api/reviewer/client-status
 * Requires reviewer/admin auth. Set a matched/paired client's pipeline status.
 * Body: { clientId?, leadId?, status: "potential"|"active"|"under_contract"|"closed" }
 *
 * Either clientId or leadId (or both, when linked) must be supplied. The status is
 * validated against the allowed list; no arbitrary columns are ever written. The
 * authoritative `pipeline_status` is updated so the change is also reflected on the
 * agent dashboard after refresh. Returns { ok, status, label }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "PATCH");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);

    const body = getJsonBody(req);
    const status = requireEnum<PipelineStatus>(body, "status", PIPELINE_STATUSES);
    const clientId = optionalString(body, "clientId") ?? null;
    const leadId = optionalString(body, "leadId") ?? null;
    if (!clientId && !leadId) {
      throw new HttpError(400, "A clientId or leadId is required.");
    }

    try {
      const result = await updateClientStatusByReviewer({ clientId, leadId, status });
      console.log("REVIEWER_CLIENT_STATUS_UPDATED", {
        reviewerProfileId: reviewer.profileId,
        hasClientId: Boolean(clientId),
        hasLeadId: Boolean(leadId),
        status: result.status,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { hasClientId: Boolean(clientId), hasLeadId: Boolean(leadId) });
      throw error;
    }
  });
}
