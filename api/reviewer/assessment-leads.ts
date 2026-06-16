import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
} from "../_lib/http.js";
import {
  listReviewerAssessmentLeads,
  type LeadSource,
  type LeadStatus,
} from "../../backend/lib/assessmentLeads.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/assessment-leads";
const STATUSES: LeadStatus[] = [
  "started",
  "in_progress",
  "completed",
  "abandoned",
  "followed_up",
];
const SOURCES: LeadSource[] = ["qr", "agent_link", "reviewer"];

/**
 * GET /api/reviewer/assessment-leads?status=&source=&search=&limit=
 * Requires reviewer/admin auth. Not-completed leads first, newest activity first.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    await requireReviewer(req);

    const statusParam = getQueryParam(req, "status");
    const sourceParam = getQueryParam(req, "source");
    const status =
      statusParam && STATUSES.includes(statusParam as LeadStatus)
        ? (statusParam as LeadStatus)
        : null;
    const source =
      sourceParam && SOURCES.includes(sourceParam as LeadSource)
        ? (sourceParam as LeadSource)
        : null;
    const search = getQueryParam(req, "search") ?? null;
    const limitRaw = getQueryParam(req, "limit");
    const limit = limitRaw ? Number(limitRaw) : null;

    try {
      const leads = await listReviewerAssessmentLeads({
        status,
        source,
        search,
        limit: Number.isFinite(limit) ? limit : null,
      });
      sendJson(res, 200, { leads });
    } catch (error) {
      logSupabaseError(ROUTE, error);
      throw error;
    }
  });
}
