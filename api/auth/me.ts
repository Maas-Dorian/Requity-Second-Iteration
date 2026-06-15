import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson, HttpError } from "../_lib/http";
import { getUserFromRequest, mapSupabaseUserToProfile } from "../../backend/lib/auth";
import { getAgentByUserId } from "../../backend/lib/users";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger";

const ROUTE = "auth/me";

/**
 * GET /api/auth/me
 * Protected — requires Authorization: Bearer <access_token>.
 * Returns the current user, their profile + role, and agent row if role=agent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    const user = await getUserFromRequest(req);
    if (!user) throw new HttpError(401, "Authentication required.");

    try {
      const profile = await mapSupabaseUserToProfile(user);
      const role = profile?.role ?? null;
      const agent = role === "agent" ? await getAgentByUserId(user.id) : null;

      sendJson(res, 200, {
        user: { id: user.id, email: user.email },
        role,
        profile: profile
          ? { id: profile.profileId, email: profile.email, role: profile.role }
          : null,
        agent: agent
          ? { id: agent.id, displayName: agent.display_name, email: agent.email, publicToken: agent.public_assessment_token, archetype: agent.archetype }
          : null,
        needsBootstrap: !profile,
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { userId: user.id });
      throw error;
    }
  });
}
