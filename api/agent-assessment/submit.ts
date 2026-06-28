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
  asSubmitError,
} from "../_lib/http.js";
import {
  submitAgentAssessment,
  type AgentAnswers,
} from "../../backend/lib/agentAssessments.js";
import { getUserFromRequest, mapSupabaseUserToProfile } from "../../backend/lib/auth.js";
import { ensureAgentForUser } from "../../backend/lib/users.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "agent-assessment/submit";

/**
 * POST /api/agent-assessment/submit
 * Body: { answers, contact?:{name,email,phone?,dateOfBirth?}, agentId?, profileId? }
 *
 * Primary path: an authenticated agent/admin. When an Authorization bearer token
 * is present, the result is attached to THAT user's own agent row (identity is
 * taken from the session, body-provided ids are ignored). No duplicate contact
 * info is collected; the agent profile is the source of truth.
 *
 * Anonymous fallback (kept for safety): validated + rate limited, requires
 * contact. Archetype is always recomputed server-side.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const body = getJsonBody(req);
    const answers = requireAnswers(body, "answers") as AgentAnswers;

    // City/market the agent primarily works in. Required, trimmed, 2 to 120 chars.
    // This is metadata only and never affects archetype scoring.
    const marketCity = (optionalString(body, "marketCity") ?? "").trim();
    if (marketCity.length < 2 || marketCity.length > 120) {
      logValidationFailure(ROUTE, "invalid_market_city", { length: marketCity.length });
      throw new HttpError(400, "Please enter the city or market you work in (2 to 120 characters).");
    }
    // Optional structured market state + service radius (metadata, not scored).
    const marketState = (optionalString(body, "marketState") ?? "").trim() || null;
    const radiusRaw = (body as Record<string, unknown>)["serviceRadiusMiles"];
    const serviceRadiusMiles =
      typeof radiusRaw === "number" && Number.isFinite(radiusRaw) && radiusRaw >= 0
        ? Math.min(Math.round(radiusRaw), 100000)
        : null;

    // --- Authenticated agent/admin: attach to their own agent row -----------
    const user = await getUserFromRequest(req);
    if (user) {
      const profile = await mapSupabaseUserToProfile(user);
      if (!profile || !(profile.role === "agent" || profile.role === "admin")) {
        throw new HttpError(403, "Agent or admin access is required to submit this assessment.");
      }
      const email = profile.email ?? user.email ?? "";
      if (!email) throw new HttpError(400, "Your account is missing an email address.");
      try {
        const agent = await ensureAgentForUser({ userId: user.id, email });
        const result = await submitAgentAssessment({
          contact: { name: agent.display_name, email: agent.email, phone: agent.phone },
          answers,
          marketCity,
          marketState,
          serviceRadiusMiles,
          agentId: agent.id,
          profileId: profile.profileId,
        });
        sendJson(res, 200, result);
      } catch (error) {
        logSupabaseError(ROUTE, error, { userId: user.id });
        throw asSubmitError(error, "AGENT_ASSESSMENT_SUBMIT_FAILED", "public.agents");
      }
      return;
    }

    // --- Anonymous fallback (rate limited, contact required) ----------------
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "agent_submit");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const contactRaw = requireObject(body, "contact");
    const contact = {
      name: requireString(contactRaw, "name"),
      email: requireEmail(contactRaw, "email"),
      phone: sanitizePhone(contactRaw["phone"]) ?? null,
      dateOfBirth: optionalDate(contactRaw, "dateOfBirth") ?? null,
    };

    try {
      const result = await submitAgentAssessment({
        contact,
        answers,
        marketCity,
        marketState,
        serviceRadiusMiles,
        agentId: optionalString(body, "agentId") ?? null,
        profileId: optionalString(body, "profileId") ?? null,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { email: contact.email });
      throw asSubmitError(error, "AGENT_ASSESSMENT_SUBMIT_FAILED", "public.agents");
    }
  });
}
