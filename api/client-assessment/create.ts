import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireEnum,
  optionalString,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
} from "../_lib/http";
import { createClientAssessmentLink } from "../../backend/lib/clientAssessments";
import { checkRateLimit } from "../../backend/lib/rateLimit";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger";

const ROUTE = "client-assessment/create";

/**
 * POST /api/client-assessment/create
 * Body: { source: "qr"|"agent_link"|"reviewer", agentId?, agentToken?, frontendUrl? }
 * Returns: { token, surveyUrl, source, agentId }
 * Public route — validated + rate limited.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "client_create");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);
    const source = requireEnum(body, "source", ["qr", "agent_link", "reviewer"] as const);

    try {
      const link = await createClientAssessmentLink({
        source,
        agentId: optionalString(body, "agentId") ?? null,
        agentToken: optionalString(body, "agentToken") ?? null,
        frontendUrl: optionalString(body, "frontendUrl"),
      });

      sendJson(res, 200, {
        token: link.token,
        surveyUrl: link.surveyUrl,
        source: link.source,
        agentId: link.agentId,
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { source });
      throw error;
    }
  });
}
