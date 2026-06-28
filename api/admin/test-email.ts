import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { sendBrevoEmail } from "../../backend/lib/brevo.js";
import {
  EMAIL_SUBJECTS,
  buildRequityEmailHtml,
  buildPlainTextEmail,
  agentDashboardUrl,
  type EmailContentInput,
} from "../../backend/lib/email.js";
import { recordEmailEvent } from "../../backend/lib/emailEvents.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { getOptionalEnv } from "../../backend/lib/env.js";
import { logApiStart } from "../../backend/lib/logger.js";

const ROUTE = "admin/test-email";

const TEST_CONTENT: EmailContentInput = {
  title: "REQUITY Brevo test email",
  intro: "This is a REQUITY Brevo test email. If you received this, Brevo sending is working.",
  ctaLabel: "Open REQUITY",
  ctaUrl: agentDashboardUrl(),
};

/**
 * POST /api/admin/test-email
 * Body: { to: "email@example.com" }
 *
 * Sends a REAL Brevo email using the shared transport so you can verify live
 * sending. Protected by reviewer/admin auth. When auth is unavailable you may
 * temporarily allow unauthenticated testing by setting ALLOW_PUBLIC_EMAIL_TEST=true
 * (defaults to false). Never exposes the API key or sender secrets.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    logApiStart(ROUTE);

    const allowPublic =
      (getOptionalEnv("ALLOW_PUBLIC_EMAIL_TEST") ?? "").toLowerCase() === "true";

    if (!allowPublic) {
      // Reviewer or admin only. Any auth failure surfaces as 401/403.
      await requireReviewer(req);
    }

    const body = getJsonBody(req);
    const to = requireString(body, "to").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new HttpError(400, "A valid `to` email address is required.");
    }

    const result = await sendBrevoEmail({
      to: [{ email: to }],
      subject: EMAIL_SUBJECTS.testEmail,
      htmlContent: buildRequityEmailHtml(TEST_CONTENT),
      textContent: buildPlainTextEmail(TEST_CONTENT),
      tags: ["test_email"],
    });

    const status = result.sent ? "sent" : result.testMode ? "skipped" : "failed";
    await recordEmailEvent({
      recipientEmail: to,
      templateKey: "test_email",
      eventType: "test_email",
      status,
      brevoMessageId: result.providerMessageId ?? null,
      errorMessage: result.sent ? null : result.error ?? null,
      eventKey: null,
      payload: { httpStatus: result.httpStatus ?? null, errorCode: result.errorCode ?? null },
    });

    // Safe response, booleans/codes only, never the API key, body, or sender
    // secret. 200 when sent or in test mode (no key configured); 502 on a real
    // Brevo failure so callers see the honest outcome.
    sendJson(res, result.sent || result.testMode ? 200 : 502, {
      ok: result.sent,
      provider: "brevo",
      status,
      recipient: to,
      httpStatus: result.httpStatus ?? null,
      errorCode: result.sent ? null : result.errorCode ?? null,
      testMode: Boolean(result.testMode),
    });
  });
}
