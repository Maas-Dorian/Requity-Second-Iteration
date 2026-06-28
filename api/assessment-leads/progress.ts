import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  optionalString,
  optionalRecord,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { updateAssessmentLeadProgress } from "../../backend/lib/assessmentLeads.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "assessment-leads/progress";

/**
 * POST /api/assessment-leads/progress
 * Public route, called (debounced) as the client answers questions.
 * Body: { leadId, answeredCount?, partialAnswers?, archetype? }
 * Returns a minimal status only (does not expose other lead data).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "lead_progress");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);
    const leadId = requireString(body, "leadId");

    let answeredCount: number | undefined;
    if (body["answeredCount"] !== undefined) {
      const parsed = Number(body["answeredCount"]);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
        throw new HttpError(400, "Invalid answeredCount.");
      }
      answeredCount = Math.round(parsed);
    }

    const partialAnswers = optionalRecord(body, "partialAnswers");

    try {
      const lead = await updateAssessmentLeadProgress({
        leadId,
        answeredCount,
        partialAnswers: Object.keys(partialAnswers).length ? partialAnswers : undefined,
        archetype: optionalString(body, "archetype") ?? null,
      });
      if (!lead) {
        sendJson(res, 404, { error: "Lead not found." });
        return;
      }
      sendJson(res, 200, {
        leadId: lead.id,
        status: lead.status,
        answeredCount: lead.answered_count,
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { leadId });
      throw error;
    }
  });
}
