import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireEnum,
  requireObject,
  requireString,
  optionalString,
  optionalEmail,
  optionalDate,
  sanitizePhone,
  requireAnswers,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
} from "../_lib/http";
import {
  submitClientAssessmentWithContact,
  type ClientAnswers,
  type ClientArchetypeResult,
} from "../../backend/lib/clientAssessments";
import { checkRateLimit } from "../../backend/lib/rateLimit";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger";

const ROUTE = "client-assessment/submit";

/**
 * POST /api/client-assessment/submit
 * Body: { assessmentToken?|token?, source, contact:{fullName,email?,phone?,dateOfBirth?}, answers, result?, agentId?, agentToken? }
 *
 * Public route — validated + rate limited. Valid when it includes either an
 * assessmentToken/token OR an agentToken/agentId. Source-specific rule:
 *   - qr / agent_link -> require agentToken or agentId; attach to that agent;
 *     no reviewer queue item.
 *   - reviewer        -> require assessmentToken/token; create a reviewer queue item.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "client_submit");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);

    const source = requireEnum(body, "source", ["qr", "agent_link", "reviewer"] as const);
    // `assessmentToken` is accepted as an alias for `token`.
    const token = optionalString(body, "assessmentToken") ?? optionalString(body, "token") ?? null;
    const agentId = optionalString(body, "agentId") ?? null;
    const agentToken = optionalString(body, "agentToken") ?? null;

    // Submission rule:
    //  - qr / agent_link -> require agentToken or agentId (attach to that agent,
    //    no reviewer queue item).
    //  - reviewer        -> require an assessment token (create reviewer queue item).
    //  - neither present  -> reject.
    if (source === "qr" || source === "agent_link") {
      if (!agentToken && !agentId) {
        logValidationFailure(ROUTE, "missing_agent_reference", { source });
        throw new HttpError(
          400,
          "An agentToken or agentId is required for qr/agent_link submissions."
        );
      }
    } else if (source === "reviewer") {
      if (!token) {
        logValidationFailure(ROUTE, "missing_assessment_token", { source });
        throw new HttpError(
          400,
          "An assessmentToken/token is required for reviewer submissions."
        );
      }
    } else if (!token && !agentToken && !agentId) {
      logValidationFailure(ROUTE, "missing_link_reference", { source });
      throw new HttpError(400, "A link token or agent reference is required for submission.");
    }

    const contactRaw = requireObject(body, "contact");
    const contact = {
      fullName: requireString(contactRaw, "fullName"),
      email: optionalEmail(contactRaw, "email") ?? null,
      phone: sanitizePhone(contactRaw["phone"]) ?? null,
      dateOfBirth: optionalDate(contactRaw, "dateOfBirth") ?? null,
    };

    const answers = requireAnswers(body, "answers") as ClientAnswers;
    const archetypeResult =
      body.result && typeof body.result === "object"
        ? (body.result as ClientArchetypeResult)
        : null;

    try {
      const result = await submitClientAssessmentWithContact({
        token,
        source,
        contact,
        answers,
        agentId,
        agentToken,
        archetypeResult,
        leadId: optionalString(body, "leadId") ?? null,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { source });
      throw error;
    }
  });
}
