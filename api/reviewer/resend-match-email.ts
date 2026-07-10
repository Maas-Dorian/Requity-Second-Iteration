import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
} from "../_lib/http.js";
import { resendMatchEmail } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/resend-match-email";

/**
 * POST /api/reviewer/resend-match-email
 * Body: { matchId }
 *
 * Requires reviewer/admin auth. Re-sends the lane-specific agent match email
 * for one match. Buying matches send the buying email, selling matches the
 * selling email; the wrong lane can never be sent. Every send is recorded in
 * email_events (explicit resends bypass dedupe with a timestamped key).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    await requireReviewer(req);

    const body = getJsonBody(req);
    const matchId = requireString(body, "matchId");

    try {
      const result = await resendMatchEmail(matchId);
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { matchId });
      throw error;
    }
  });
}
