import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  optionalString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import {
  archiveClientByReviewer,
  type ArchiveClientScope,
} from "../../backend/lib/reviewerArchive.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/clients";

const SCOPES: ArchiveClientScope[] = ["paired", "up_for_review", "closed", "any"];

/**
 * DELETE /api/reviewer/clients
 * Body: { clientId?, leadId?, scope?: "paired" | "up_for_review" | "closed" | "any" }
 *
 * Requires reviewer/admin auth. Soft-deletes (archives) a client and/or lead:
 * they leave the active reviewer views (Up for Review, Paired Clients,
 * Locations) but their assessment history, match records, and email events are
 * kept. Never a hard delete.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "DELETE");
    logApiStart(ROUTE);

    const reviewer = await requireReviewer(req);

    const body = getJsonBody(req);
    const clientId = optionalString(body, "clientId") ?? null;
    const leadId = optionalString(body, "leadId") ?? null;
    if (!clientId && !leadId) {
      throw new HttpError(400, "A clientId or leadId is required.");
    }
    const scopeRaw = (optionalString(body, "scope") ?? "any").toLowerCase();
    if (!SCOPES.includes(scopeRaw as ArchiveClientScope)) {
      throw new HttpError(400, "Invalid scope. Expected paired, up_for_review, closed, or any.");
    }

    try {
      const result = await archiveClientByReviewer({
        clientId,
        leadId,
        scope: scopeRaw as ArchiveClientScope,
      });
      console.log("REVIEWER_CLIENT_DELETE", {
        reviewerProfileId: reviewer.profileId,
        hasClientId: Boolean(clientId),
        hasLeadId: Boolean(leadId),
        scope: scopeRaw,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { hasClientId: Boolean(clientId), hasLeadId: Boolean(leadId) });
      throw error;
    }
  });
}
