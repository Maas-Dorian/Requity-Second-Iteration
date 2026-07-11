import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  getJsonBody,
  requireString,
  optionalString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import {
  listReviewerAnnouncements,
  saveReviewerAnnouncement,
  setReviewerAnnouncementStatus,
  deleteReviewerAnnouncement,
} from "../../backend/lib/announcements.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/announcements";

/**
 * Reviewer Updates and Announcements API. All methods require reviewer/admin
 * auth; agents and unauthenticated users can never reach these actions.
 *
 *  GET    /api/reviewer/announcements   List + summary counts.
 *  POST   /api/reviewer/announcements   Create (draft or publish now) or, with
 *         { action: publish|unpublish|archive, announcementId }, change status.
 *  PATCH  /api/reviewer/announcements   Edit an existing announcement.
 *  DELETE /api/reviewer/announcements   { announcementId } permanent removal
 *         (the UI requires an explicit confirmation first).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    logApiStart(ROUTE);
    const reviewer = await requireReviewer(req);

    if (req.method === "GET") {
      try {
        const result = await listReviewerAnnouncements();
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        logSupabaseError(ROUTE, error);
        throw error;
      }
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const body = getJsonBody(req);
      const action = optionalString(body, "action");

      try {
        if (action) {
          if (action !== "publish" && action !== "unpublish" && action !== "archive") {
            throw new HttpError(400, "Invalid action. Expected publish, unpublish, or archive.");
          }
          const announcementId = requireString(body, "announcementId");
          const result = await setReviewerAnnouncementStatus(announcementId, action);
          console.log("REVIEWER_ANNOUNCEMENT_ACTION", {
            reviewerProfileId: reviewer.profileId,
            announcementId,
            action,
          });
          sendJson(res, 200, result);
          return;
        }

        const result = await saveReviewerAnnouncement({
          announcementId:
            req.method === "PATCH" ? requireString(body, "announcementId") : null,
          title: requireString(body, "title"),
          body: requireString(body, "body"),
          priority: requireString(body, "priority"),
          audience: requireString(body, "audience"),
          ctaLabel: optionalString(body, "ctaLabel") ?? null,
          ctaUrl: optionalString(body, "ctaUrl") ?? null,
          dismissible: body.dismissible !== false,
          startsAt: optionalString(body, "startsAt") ?? null,
          endsAt: optionalString(body, "endsAt") ?? null,
          targetAgentIds: Array.isArray(body.targetAgentIds)
            ? (body.targetAgentIds as unknown[]).map(String)
            : null,
          publishNow: body.publishNow === true,
          reviewerProfileId: reviewer.profileId ?? null,
        });
        sendJson(res, 200, result);
      } catch (error) {
        logSupabaseError(ROUTE, error);
        throw error;
      }
      return;
    }

    if (req.method === "DELETE") {
      const body = getJsonBody(req);
      const announcementId = requireString(body, "announcementId");
      try {
        const result = await deleteReviewerAnnouncement(announcementId);
        console.log("REVIEWER_ANNOUNCEMENT_REMOVE", {
          reviewerProfileId: reviewer.profileId,
          announcementId,
        });
        sendJson(res, 200, result);
      } catch (error) {
        logSupabaseError(ROUTE, error, { announcementId });
        throw error;
      }
      return;
    }

    throw new HttpError(405, "Method not allowed. Expected GET, POST, PATCH, or DELETE.");
  });
}
