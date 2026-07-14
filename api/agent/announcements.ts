import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  getJsonBody,
  requireString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import {
  listAgentAnnouncements,
  dismissAgentAnnouncement,
} from "../../backend/lib/announcements.js";
import { requireAgent } from "../../backend/lib/auth.js";
import { requireAgentPlatformAccess } from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "agent/announcements";

/**
 * Agent-facing announcements. Requires an authenticated AGENT session; the
 * agent identity always comes from the session, never from the request, so an
 * agent can only ever read or dismiss their own announcements. Nothing here is
 * reachable without auth, and announcements never render on public pages.
 *
 *  GET  /api/agent/announcements   Active, targeted, not-dismissed banners.
 *  POST /api/agent/announcements   { announcementId } dismisses a dismissible
 *       banner for this agent only.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    logApiStart(ROUTE);
    const profile = await requireAgent(req);
    // Hard access gate: announcements are a dashboard feature.
    await requireAgentPlatformAccess(profile);
    const agentId = profile.agentId;
    if (!agentId) {
      // A profile without an agent record has no announcements; empty is fine.
      sendJson(res, 200, { ok: true, announcements: [] });
      return;
    }

    if (req.method === "GET") {
      try {
        const announcements = await listAgentAnnouncements(agentId);
        sendJson(res, 200, { ok: true, announcements });
      } catch (error) {
        logSupabaseError(ROUTE, error);
        throw error;
      }
      return;
    }

    if (req.method === "POST") {
      const body = getJsonBody(req);
      const announcementId = requireString(body, "announcementId");
      try {
        const result = await dismissAgentAnnouncement(announcementId, agentId);
        sendJson(res, 200, result);
      } catch (error) {
        logSupabaseError(ROUTE, error, { announcementId });
        throw error;
      }
      return;
    }

    throw new HttpError(405, "Method not allowed. Expected GET or POST.");
  });
}
