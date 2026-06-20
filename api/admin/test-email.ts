import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireEmail,
  sendJson,
} from "../_lib/http.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { sendBrevoEmail } from "../../backend/lib/email.js";
import { emailLayout } from "../../backend/emails/index.js";
import { logApiStart } from "../../backend/lib/logger.js";

const ROUTE = "admin/test-email";

/**
 * POST /api/admin/test-email
 * Body: { to: string }
 *
 * Reviewer/admin ONLY. Sends a single REQUITY Brevo test email so operators can
 * verify production email config. Never public, never returns the API key.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    // Reviewer or admin only.
    await requireReviewer(req);

    const body = getJsonBody(req);
    const to = requireEmail(body, "to");

    const send = await sendBrevoEmail({
      to: [{ email: to }],
      subject: "REQUITY email test",
      htmlContent: emailLayout({
        body: `<p style="font-size:15px;line-height:1.6;margin:0;">This is a REQUITY Brevo test email.</p>`,
        preheader: "REQUITY Brevo test email",
      }),
    });

    // Map to a safe status; never leak provider internals or the API key.
    const emailStatus = send.sent ? "sent" : send.testMode ? "skipped" : "failed";
    sendJson(res, 200, {
      ok: send.sent,
      provider: "brevo",
      emailStatus,
      to,
    });
  });
}
