import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireObject,
  requireString,
  requireEmail,
  optionalString,
  optionalDate,
  sanitizePhone,
  requireAnswers,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
} from "../_lib/http";
import {
  submitAgentAssessment,
  type AgentAnswers,
} from "../../backend/lib/agentAssessments";
import { checkRateLimit } from "../../backend/lib/rateLimit";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger";

const ROUTE = "agent-assessment/submit";

/**
 * POST /api/agent-assessment/submit
 * Body: { contact:{name,email,phone?,dateOfBirth?}, answers, agentId?, profileId? }
 * Public route — validated + rate limited. Archetype is recomputed server-side.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "agent_submit");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);

    const contactRaw = requireObject(body, "contact");
    const contact = {
      name: requireString(contactRaw, "name"),
      email: requireEmail(contactRaw, "email"),
      phone: sanitizePhone(contactRaw["phone"]) ?? null,
      dateOfBirth: optionalDate(contactRaw, "dateOfBirth") ?? null,
    };

    const answers = requireAnswers(body, "answers") as AgentAnswers;

    try {
      const result = await submitAgentAssessment({
        contact,
        answers,
        agentId: optionalString(body, "agentId") ?? null,
        profileId: optionalString(body, "profileId") ?? null,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { email: contact.email });
      throw error;
    }
  });
}
