import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireEnum,
  requireString,
  optionalString,
  optionalEmail,
  sanitizePhone,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { upsertAssessmentLeadStart } from "../../backend/lib/assessmentLeads.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "assessment-leads/start";

/**
 * POST /api/assessment-leads/start
 * Public route — called when contact info is submitted and the assessment begins.
 * Captures an incomplete lead so reviewers can follow up if it's never finished.
 *
 * Body: { source, fullName, email, phone?, agentId?, agentToken?, reviewerId?, contactConsent? }
 * Returns: { leadId, status }
 * Note: the assessment UUID is not known yet at start, so the lead links to it
 * later at completion (via client-assessment/submit).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "lead_start");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);
    const source = requireEnum(body, "source", ["qr", "agent_link", "reviewer"] as const);
    const agentId = optionalString(body, "agentId") ?? null;
    const agentToken = optionalString(body, "agentToken") ?? null;

    // qr / agent_link must reference an agent so the lead attaches correctly.
    if ((source === "qr" || source === "agent_link") && !agentId && !agentToken) {
      logValidationFailure(ROUTE, "missing_agent_reference", { source });
      throw new HttpError(400, "An agentToken or agentId is required for qr/agent_link leads.");
    }

    const fullName = requireString(body, "fullName");
    const email = optionalEmail(body, "email") ?? null;
    const phone = sanitizePhone(body["phone"]) ?? null;

    try {
      const lead = await upsertAssessmentLeadStart({
        source,
        fullName,
        email,
        phone,
        agentId,
        agentToken,
        reviewerId: optionalString(body, "reviewerId") ?? null,
        contactConsent: body["contactConsent"] !== false,
      });
      sendJson(res, 200, { leadId: lead.id, status: lead.status });
    } catch (error) {
      logSupabaseError(ROUTE, error, { source });
      throw error;
    }
  });
}
