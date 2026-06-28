import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  optionalString,
  sendJson,
  HttpError,
  asSubmitError,
} from "../_lib/http.js";
import { updateAgentMarketProfile } from "../../backend/lib/agentAssessments.js";
import { getUserFromRequest, mapSupabaseUserToProfile } from "../../backend/lib/auth.js";
import { ensureAgentForUser } from "../../backend/lib/users.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "agent/market-profile";

/**
 * POST /api/agent/market-profile
 * Body: { marketCity, marketState?, serviceRadiusMiles? }
 *
 * Authenticated agent/admin only. Saves the agent's market location + service
 * radius without requiring the full archetype assessment (used by the dashboard
 * "Complete your market profile" card for assessment-exempt agents).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const user = await getUserFromRequest(req);
    if (!user) throw new HttpError(401, "Sign in to update your market profile.");
    const profile = await mapSupabaseUserToProfile(user);
    if (!profile || !(profile.role === "agent" || profile.role === "admin")) {
      throw new HttpError(403, "Agent or admin access is required.");
    }

    const body = getJsonBody(req);
    const marketCity = (optionalString(body, "marketCity") ?? "").trim();
    if (marketCity.length < 2 || marketCity.length > 120) {
      logValidationFailure(ROUTE, "invalid_market_city", { length: marketCity.length });
      throw new HttpError(400, "Please enter the city or market you work in (2 to 120 characters).");
    }
    const marketState = (optionalString(body, "marketState") ?? "").trim() || null;
    const radiusRaw = (body as Record<string, unknown>)["serviceRadiusMiles"];
    const serviceRadiusMiles =
      typeof radiusRaw === "number" && Number.isFinite(radiusRaw) && radiusRaw >= 0
        ? Math.min(Math.round(radiusRaw), 100000)
        : null;

    try {
      const email = profile.email ?? user.email ?? "";
      const agent = await ensureAgentForUser({ userId: user.id, email });
      const result = await updateAgentMarketProfile({
        agentId: agent.id,
        marketCity,
        marketState,
        serviceRadiusMiles,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { userId: user.id });
      throw asSubmitError(error, "AGENT_MARKET_PROFILE_FAILED", "public.agents");
    }
  });
}
