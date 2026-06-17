import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireEnum,
  optionalString,
  optionalEmail,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { completeAssessmentLead } from "../../backend/lib/assessmentLeads.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "assessment-leads/complete";

/**
 * POST /api/assessment-leads/complete
 * Public route — marks an incomplete lead as completed. Normally called server-
 * side by client-assessment/submit, but exposed for direct use too.
 * Body: { leadId? , clientAssessmentId?, email?, source?, archetype?, answeredCount? }
 * Returns: { leadId, status } or { matched:false }
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "lead_complete");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);
    const leadId = optionalString(body, "leadId") ?? null;
    const clientAssessmentId = optionalString(body, "clientAssessmentId") ?? null;
    const email = optionalEmail(body, "email") ?? null;
    const rawSource = body["source"]
      ? requireEnum(body, "source", ["qr", "agent_link", "reviewer", "client"] as const)
      : null;
    // The leads table only allows qr/agent_link/reviewer; map direct public
    // 'client' completions to the reviewer-queue follow-up source.
    const source = rawSource
      ? rawSource === "qr" || rawSource === "agent_link"
        ? rawSource
        : "reviewer"
      : null;

    if (!leadId && !clientAssessmentId && !(email && source)) {
      logValidationFailure(ROUTE, "missing_lead_reference");
      throw new HttpError(400, "Provide leadId, clientAssessmentId, or email + source.");
    }

    try {
      const lead = await completeAssessmentLead({
        leadId,
        clientAssessmentId,
        email,
        source,
        archetype: optionalString(body, "archetype") ?? null,
      });
      if (!lead) {
        sendJson(res, 200, { matched: false });
        return;
      }
      sendJson(res, 200, { leadId: lead.id, status: lead.status });
    } catch (error) {
      logSupabaseError(ROUTE, error, { leadId });
      throw error;
    }
  });
}
