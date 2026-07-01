import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { getEmailConfigStatus } from "../../backend/lib/env.js";

/**
 * GET /api/health/email
 * Reports whether SendGrid transactional email is configured. Booleans only, it
 * NEVER returns the API key or sender values and NEVER sends a test email.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    const status = getEmailConfigStatus();
    sendJson(res, 200, {
      ok: status.canSendConfigured,
      provider: status.provider,
      hasSendGridApiKey: status.hasSendGridApiKey,
      hasSenderEmail: status.hasSenderEmail,
      hasSenderName: status.hasSenderName,
      hasPublicSiteUrl: status.hasPublicSiteUrl,
      hasReviewNotificationEmail: status.hasReviewNotificationEmail,
      canSendConfigured: status.canSendConfigured,
      // Safe, public origin used in email CTAs, never a secret.
      publicSiteUrl: status.publicSiteUrl,
      timestamp: new Date().toISOString(),
    });
  });
}
