import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  getJsonBody,
  getQueryParam,
  requireString,
  optionalString,
  optionalRecord,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { archiveAgentByReviewer } from "../../backend/lib/reviewerArchive.js";
import {
  listReviewerAgents,
  getReviewerAgentDetail,
  updateReviewerAgent,
  AGENT_ARCHETYPES,
} from "../../backend/lib/reviewerAgents.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/agents";

/**
 * Reviewer Agent Control Center API. All methods require reviewer/admin auth.
 *
 *  GET    /api/reviewer/agents            Full agent list + summary counts.
 *  GET    /api/reviewer/agents?agentId=x  One agent's full detail (profile,
 *                                         matches history, payment).
 *  PATCH  /api/reviewer/agents            { agentId, archetype?, reviewerNotes?,
 *                                           restore?, location? }
 *  DELETE /api/reviewer/agents            { agentId } soft archive. The agent
 *         leaves matching/suggestions; historical match records, email events,
 *         and assessment data are kept. Never a hard delete.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    logApiStart(ROUTE);
    const reviewer = await requireReviewer(req);

    if (req.method === "GET") {
      const agentId = getQueryParam(req, "agentId");
      try {
        if (agentId) {
          const detail = await getReviewerAgentDetail(agentId);
          sendJson(res, 200, { ok: true, ...detail });
        } else {
          const result = await listReviewerAgents();
          sendJson(res, 200, { ok: true, ...result, archetypes: AGENT_ARCHETYPES });
        }
      } catch (error) {
        logSupabaseError(ROUTE, error, { hasAgentId: Boolean(agentId) });
        throw error;
      }
      return;
    }

    if (req.method === "PATCH") {
      const body = getJsonBody(req);
      const agentId = requireString(body, "agentId");
      const location = optionalRecord(body, "location");
      try {
        const result = await updateReviewerAgent({
          agentId,
          archetype: optionalString(body, "archetype") ?? undefined,
          // Distinguish "not provided" from "clear the notes" (empty string).
          reviewerNotes:
            body.reviewerNotes === undefined ? undefined : String(body.reviewerNotes ?? ""),
          restore: body.restore === true,
          location: location
            ? {
                marketCity: optionalString(location, "marketCity") ?? null,
                marketState: optionalString(location, "marketState") ?? null,
                serviceRadiusMiles:
                  location.serviceRadiusMiles != null &&
                  Number.isFinite(Number(location.serviceRadiusMiles))
                    ? Number(location.serviceRadiusMiles)
                    : null,
                serviceAreas: optionalString(location, "serviceAreas") ?? null,
              }
            : null,
        });
        console.log("REVIEWER_AGENT_PATCH", {
          reviewerProfileId: reviewer.profileId,
          agentId,
          updated: result.updated,
        });
        sendJson(res, 200, result);
      } catch (error) {
        logSupabaseError(ROUTE, error, { agentId });
        throw error;
      }
      return;
    }

    if (req.method === "DELETE") {
      const body = getJsonBody(req);
      const agentId = requireString(body, "agentId");
      try {
        const result = await archiveAgentByReviewer(agentId);
        console.log("REVIEWER_AGENT_DELETE", {
          reviewerProfileId: reviewer.profileId,
          agentId,
        });
        sendJson(res, 200, result);
      } catch (error) {
        logSupabaseError(ROUTE, error, { agentId });
        throw error;
      }
      return;
    }

    throw new HttpError(405, "Method not allowed. Expected GET, PATCH, or DELETE.");
  });
}
