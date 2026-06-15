import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  optionalString,
  sendJson,
  HttpError,
} from "../../_lib/http";
import {
  updateAssessmentLeadFollowUpStatus,
  type LeadStatus,
} from "../../../backend/lib/assessmentLeads";
import { requireReviewer } from "../../../backend/lib/auth";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../../backend/lib/logger";

const ROUTE = "reviewer/assessment-leads/update";
const ALLOWED: LeadStatus[] = ["followed_up", "abandoned", "in_progress", "started", "completed"];

/**
 * POST /api/reviewer/assessment-leads/update
 * Requires reviewer/admin auth. Update a lead's follow-up status and/or notes.
 * Body: { leadId, status?, notes? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);

    const body = getJsonBody(req);
    const leadId = requireString(body, "leadId");

    let status: LeadStatus | null = null;
    const statusRaw = optionalString(body, "status");
    if (statusRaw) {
      if (!ALLOWED.includes(statusRaw as LeadStatus)) {
        logValidationFailure(ROUTE, "invalid_status", { status: statusRaw });
        throw new HttpError(400, `Invalid status. Expected one of: ${ALLOWED.join(", ")}.`);
      }
      status = statusRaw as LeadStatus;
    }

    const notes = body["notes"] === undefined ? undefined : optionalString(body, "notes") ?? null;

    try {
      const lead = await updateAssessmentLeadFollowUpStatus({
        leadId,
        status,
        notes,
        reviewerId: reviewer.demo ? null : reviewer.profileId,
      });
      sendJson(res, 200, { lead });
    } catch (error) {
      logSupabaseError(ROUTE, error, { leadId });
      throw error;
    }
  });
}
