import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
} from "../_lib/http.js";
import { getPublicAgentByReference } from "../../backend/lib/agentSlug.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "agent/public-link";

/**
 * GET /api/agent/public-link?slug=<slug>  (or ?agent=<token>)
 *
 * PUBLIC, read-only resolver for the client assessment page. Given a branded
 * public slug (preferred) or a legacy public token, returns SAFE agent info for
 * attribution ("You're completing this for <name>"). It never returns the raw
 * agent id, profile id, email, or token.
 *
 * Response:
 *   found    → { ok: true, agent: { displayName, publicSlug, marketCity },
 *               assessment: { source: "agent_link" } }
 *   not found→ { ok: false }  (200, so the page can show a clean "invalid or
 *               expired link" message instead of treating it as a crash)
 *
 * The client assessment submit attaches the client by re-resolving the slug/
 * token server-side, so this endpoint is display-only.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    const slug = getQueryParam(req, "slug");
    // Accept the same token aliases the assessment page uses on legacy links.
    const token =
      getQueryParam(req, "agent") ||
      getQueryParam(req, "agentToken") ||
      getQueryParam(req, "a");

    if (!slug && !token) {
      sendJson(res, 200, { ok: false });
      return;
    }

    try {
      const agent = await getPublicAgentByReference({ slug, token });
      if (!agent) {
        sendJson(res, 200, { ok: false });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        agent: {
          displayName: agent.displayName,
          publicSlug: agent.publicSlug,
          marketCity: agent.marketCity,
        },
        assessment: { source: "agent_link" },
      });
    } catch (error) {
      logSupabaseError(ROUTE, error, { hasSlug: !!slug, hasToken: !!token });
      // Treat any lookup failure as "not resolvable" rather than a hard crash.
      sendJson(res, 200, { ok: false });
    }
  });
}
