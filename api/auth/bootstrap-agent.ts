import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  optionalString,
  sanitizePhone,
  assertPayloadSize,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { getUserFromRequest } from "../../backend/lib/auth.js";
import { createAgentProfileForUser } from "../../backend/lib/users.js";
import { env } from "../../backend/lib/env.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "auth/bootstrap-agent";

/**
 * POST /api/auth/bootstrap-agent
 * Protected — requires Authorization: Bearer <access_token>.
 * Creates/updates the caller's profile (role='agent') and agent row, then
 * returns the profile, agent, public token, and shareable links.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const user = await getUserFromRequest(req);
    if (!user) throw new HttpError(401, "Authentication required.");

    const body = getJsonBody(req);
    const email = optionalString(body, "email") ?? user.email;
    if (!email) throw new HttpError(400, "An email is required to bootstrap the agent.");

    try {
      const { profile, agent } = await createAgentProfileForUser({
        userId: user.id,
        email,
        fullName: optionalString(body, "fullName") ?? null,
        phone: sanitizePhone(body["phone"]) ?? null,
        brokerage: optionalString(body, "brokerage") ?? null,
        licenseNumber: optionalString(body, "licenseNumber") ?? null,
      });

      const base = (optionalString(body, "frontendUrl") ?? env.frontendUrl).replace(/\/$/, "");
      const token = agent.public_assessment_token;

      sendJson(res, 200, {
        profile,
        agent,
        publicToken: token,
        dashboardUrl: `${base}/agent/dashboard.html`,
        assessmentLink: `${base}/client/assessment.html?agent=${token}&source=agent_link`,
        qrLink: `${base}/client/assessment.html?agent=${token}&source=qr`,
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { userId: user.id });
      throw error;
    }
  });
}
