import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  optionalString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { assignReviewerMatch, isMatchLane } from "../../backend/lib/reviewerMatches.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/approve-match";

/**
 * POST /api/reviewer/approve-match
 * Body: { clientId?, leadId?, agentId, score?, reason?, reviewerId?,
 *         matchLane?, replaceExisting?, replaceReason?, reviewerNotes?,
 *         notifyClient?, notifyNewAgent?, notifyPreviousAgent? }
 *
 * Requires reviewer/admin auth. Finalizes the match. Uniqueness is per client
 * (or lead) + lane: a standard client has one active general match; a
 * buying-and-selling client may hold one active buying match AND one active
 * selling match (matchLane: "buying" | "selling" | "both" | "general"). The
 * same agent may be active for unlimited clients. If the target already has a
 * conflicting active match in an overlapping lane and replaceExisting is not
 * set, responds 409 CLIENT_ALREADY_MATCHED so the reviewer can confirm a replace.
 *
 * Notify flags (all optional): notifyClient / notifyNewAgent default TRUE,
 * notifyPreviousAgent defaults FALSE. Emails are lane-specific: the buying
 * agent gets the buying email, the selling agent the selling email.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);

    const body = getJsonBody(req);
    const clientId = optionalString(body, "clientId") ?? null;
    const leadId = optionalString(body, "leadId") ?? null;
    const agentId = requireString(body, "agentId");
    if (!clientId && !leadId) {
      throw new HttpError(400, "A clientId or leadId is required.");
    }
    const replaceExisting = body.replaceExisting === true;

    const matchLaneRaw = optionalString(body, "matchLane") ?? null;
    if (matchLaneRaw && !isMatchLane(matchLaneRaw)) {
      throw new HttpError(400, "Invalid matchLane. Expected buying, selling, both, or general.");
    }

    let score: number | undefined;
    if (body.score !== undefined) {
      const parsed = Number(body.score);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new HttpError(400, "Invalid score. Expected a number between 0 and 100.");
      }
      score = Math.round(parsed);
    }

    try {
      const result = await assignReviewerMatch({
        clientId,
        leadId,
        agentId,
        score,
        reason: optionalString(body, "reason"),
        reviewerId: optionalString(body, "reviewerId") ?? reviewer.profileId,
        matchLane: matchLaneRaw,
        replaceExisting,
        replaceReason: optionalString(body, "replaceReason"),
        reviewerNotes: optionalString(body, "reviewerNotes"),
        notifyClient: body.notifyClient !== false,
        notifyNewAgent: body.notifyNewAgent !== false,
        notifyPreviousAgent: body.notifyPreviousAgent === true,
      });
      if (result.ok === false) {
        // Client already has a different active match; reviewer must confirm replace.
        sendJson(res, 409, result);
        return;
      }
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { hasClientId: Boolean(clientId), hasLeadId: Boolean(leadId), agentId });
      throw error;
    }
  });
}
