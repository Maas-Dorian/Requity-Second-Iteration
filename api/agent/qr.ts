import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { getAgentAssessmentLinks } from "../../backend/lib/dashboard.js";
import {
  generateAgentAssessmentQrDataUrl,
  generateAgentAssessmentQrPng,
} from "../../backend/lib/qrCode.js";
import { requireAgent } from "../../backend/lib/auth.js";
import { requireAgentPlatformAccess } from "../../backend/lib/agentAccess.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "agent/qr";

/**
 * GET /api/agent/qr
 * Requires agent auth. Returns the signed-in agent's QR code for their public
 * assessment link (source `qr`, these clients attach directly to the agent and
 * never enter the reviewer queue). Admins may target an agent via ?agentId=.
 *
 * Query:
 *   - format=dataUrl (default) → JSON { qrCodeDataUrl, assessmentLink, qrLink }
 *   - format=png             → image/png buffer download
 *
 * Vercel-safe: QR rendering uses the pure-JS `qrcode` package only (no canvas/sharp).
 * The Supabase service-role key is never exposed; only the public link is encoded.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");

    // Identity comes from the authenticated session, NOT a required agentId
    // query param. An admin may optionally pass ?agentId= to view another agent;
    // otherwise we use the caller's own agent row (agents AND admins can have one).
    const profile = await requireAgent(req);
    // Hard access gate: unpaid new agents cannot use platform features.
    await requireAgentPlatformAccess(profile);
    const overrideId = getQueryParam(req, "agentId");
    const agentId =
      profile.role === "admin" && overrideId ? overrideId : profile.agentId;

    logApiStart(ROUTE, { hasAuthHeader: true, resolvedAgentId: !!agentId, isAdmin: profile.role === "admin" });

    if (!agentId) {
      throw new HttpError(404, "Agent profile not found.", "AGENT_NOT_FOUND");
    }

    const format = (getQueryParam(req, "format") || "dataUrl").toLowerCase();
    const frontendUrl = getQueryParam(req, "frontendUrl");

    try {
      const { assessmentLink, qrLink } = await getAgentAssessmentLinks(agentId, { frontendUrl });
      if (!qrLink) {
        throw new HttpError(404, "No public assessment link is available for this agent yet.");
      }

      if (format === "png") {
        const png = await generateAgentAssessmentQrPng(qrLink);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Disposition", 'attachment; filename="requity-assessment-qr.png"');
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).send(png);
        return;
      }

      const qrCodeDataUrl = await generateAgentAssessmentQrDataUrl(qrLink);
      sendJson(res, 200, { qrCodeDataUrl, assessmentLink, qrLink });
    } catch (error) {
      logSupabaseError(ROUTE, error, { agentId });
      throw error;
    }
  });
}
