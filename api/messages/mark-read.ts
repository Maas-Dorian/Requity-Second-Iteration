import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
} from "../_lib/http.js";
import { markNotificationRead } from "../../backend/lib/messages.js";
import { requireAgent } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "messages/mark-read";

/**
 * POST /api/messages/mark-read
 * Body: { messageId }
 * Requires agent auth. Marks a single notification read.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    await requireAgent(req);

    const body = getJsonBody(req);
    const messageId = requireString(body, "messageId");
    try {
      const message = await markNotificationRead(messageId);
      sendJson(res, 200, { message });
    } catch (error) {
      logSupabaseError(ROUTE, error, { messageId });
      throw error;
    }
  });
}
