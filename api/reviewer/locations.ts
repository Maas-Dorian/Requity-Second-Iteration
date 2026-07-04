import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  getQueryParam,
  getJsonBody,
  optionalString,
  requireEnum,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { listReviewerLocations } from "../../backend/lib/reviewerMatches.js";
import {
  updateReviewerLocation,
  clearReviewerLocation,
  type ReviewerLocationTarget,
} from "../../backend/lib/reviewerLocationAdmin.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/locations";

const TARGET_TYPES: readonly ReviewerLocationTarget[] = ["agent", "client", "lead"];

/**
 * Reviewer location management. All methods require reviewer/admin auth.
 *
 *  GET    /api/reviewer/locations?q=&city=&state=&status=&transaction=&eligibility=&limit=&offset=
 *         Groups clients + agents by normalized market (bounded, backend-side filtering).
 *  PATCH  /api/reviewer/locations   { targetType, targetId, location: {...} }
 *         Add or update the market/location for an agent, client, or lead.
 *  DELETE /api/reviewer/locations?targetType=&targetId=  (or JSON body)
 *         Clear ONLY the location fields. The person/assessment/matches are kept.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    logApiStart(ROUTE);
    const reviewer = await requireReviewer(req);

    if (req.method === "GET") {
      const limitRaw = getQueryParam(req, "limit");
      const offsetRaw = getQueryParam(req, "offset");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const offset = offsetRaw ? Number(offsetRaw) : undefined;
      try {
        const result = await listReviewerLocations({
          q: getQueryParam(req, "q") ?? null,
          city: getQueryParam(req, "city") ?? null,
          state: getQueryParam(req, "state") ?? null,
          status: getQueryParam(req, "status") ?? null,
          transaction: getQueryParam(req, "transaction") ?? null,
          eligibility: getQueryParam(req, "eligibility") ?? null,
          limit: Number.isFinite(limit) ? limit : undefined,
          offset: Number.isFinite(offset) ? offset : undefined,
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        logSupabaseError(ROUTE, error);
        throw error;
      }
      return;
    }

    if (req.method === "PATCH") {
      const body = getJsonBody(req);
      const targetType = requireEnum<ReviewerLocationTarget>(body, "targetType", TARGET_TYPES);
      const targetId = optionalString(body, "targetId");
      if (!targetId) throw new HttpError(400, "A targetId is required.");
      const location =
        body.location && typeof body.location === "object" && !Array.isArray(body.location)
          ? (body.location as Record<string, unknown>)
          : {};
      try {
        const summary = await updateReviewerLocation({
          targetType,
          targetId,
          location: {
            marketCity: optionalString(location, "marketCity") ?? null,
            marketState: optionalString(location, "marketState") ?? null,
            serviceRadiusMiles:
              location.serviceRadiusMiles != null && Number.isFinite(Number(location.serviceRadiusMiles))
                ? Number(location.serviceRadiusMiles)
                : null,
            serviceAreas: optionalString(location, "serviceAreas") ?? null,
            buyingMarketCity: optionalString(location, "buyingMarketCity") ?? null,
            buyingMarketState: optionalString(location, "buyingMarketState") ?? null,
            sellingMarketCity: optionalString(location, "sellingMarketCity") ?? null,
            sellingMarketState: optionalString(location, "sellingMarketState") ?? null,
          },
        });
        console.log("REVIEWER_LOCATION_PATCH", {
          reviewerProfileId: reviewer.profileId,
          targetType,
        });
        sendJson(res, 200, summary);
      } catch (error) {
        logSupabaseError(ROUTE, error, { targetType });
        throw error;
      }
      return;
    }

    if (req.method === "DELETE") {
      // Accept the target from the query string (apiDelete) or a JSON body.
      const body = req.body ? getJsonBody(req) : {};
      const targetTypeRaw =
        getQueryParam(req, "targetType") ?? (optionalString(body, "targetType") as string | undefined);
      const targetId =
        getQueryParam(req, "targetId") ?? (optionalString(body, "targetId") as string | undefined);
      if (!targetTypeRaw || !TARGET_TYPES.includes(targetTypeRaw as ReviewerLocationTarget)) {
        throw new HttpError(400, `Invalid targetType. Expected one of: ${TARGET_TYPES.join(", ")}.`);
      }
      if (!targetId) throw new HttpError(400, "A targetId is required.");
      try {
        const summary = await clearReviewerLocation({
          targetType: targetTypeRaw as ReviewerLocationTarget,
          targetId,
        });
        console.log("REVIEWER_LOCATION_DELETE", {
          reviewerProfileId: reviewer.profileId,
          targetType: targetTypeRaw,
        });
        sendJson(res, 200, summary);
      } catch (error) {
        logSupabaseError(ROUTE, error, { targetType: targetTypeRaw });
        throw error;
      }
      return;
    }

    throw new HttpError(405, "Method not allowed. Expected GET, PATCH, or DELETE.");
  });
}
