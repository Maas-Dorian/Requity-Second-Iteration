import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { resendClientFinalMatchEmail } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/resend-client-email";

/**
 * POST /api/reviewer/resend-client-email
 * Body: { clientId } or { leadId }
 *
 * Requires reviewer/admin auth. Re-sends the FINAL client-facing match email
 * (one combined email for buying-and-selling clients). Rejected with 400 when
 * the client's full match is not complete yet, so a partial match can never
 * trigger a client email. Every send is recorded in email_events (explicit
 * resends bypass dedupe with a timestamped key).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    await requireReviewer(req);

    const body = getJsonBody(req);
    const clientId = typeof body.clientId === "string" ? body.clientId : null;
    const leadId = typeof body.leadId === "string" ? body.leadId : null;

    try {
      const result = await resendClientFinalMatchEmail({ clientId, leadId });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { clientId, leadId });
      throw error;
    }
  });
}
