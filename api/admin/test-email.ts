import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import {
  EMAIL_SUBJECTS,
  buildRequityEmailHtml,
  buildPlainTextEmail,
  agentDashboardUrl,
  sendAppEmail,
  type EmailContentInput,
} from "../../backend/lib/email.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { getOptionalEnv } from "../../backend/lib/env.js";
import { logApiStart } from "../../backend/lib/logger.js";

const ROUTE = "admin/test-email";

const TEST_CONTENT: EmailContentInput = {
  title: "REQUITY SendGrid test email",
  intro: "This is a REQUITY SendGrid test email. If you received this, SendGrid sending is working.",
  ctaLabel: "Open REQUITY",
  ctaUrl: agentDashboardUrl(),
};

/**
 * POST /api/admin/test-email
 * Body: { to: "email@example.com" }
 *
 * Sends a REAL email through the active provider (SendGrid) using the shared
 * sendAppEmail() surface so you can verify live sending. Protected by
 * reviewer/admin auth. When auth is unavailable you may temporarily allow
 * unauthenticated testing by setting ALLOW_PUBLIC_EMAIL_TEST=true (defaults to
 * false). Never exposes the API key or sender secrets.
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

    const result = await sendAppEmail({
      eventType: "test_email",
      to,
      subject: EMAIL_SUBJECTS.testEmail,
      html: buildRequityEmailHtml(TEST_CONTENT),
      text: buildPlainTextEmail(TEST_CONTENT),
      tags: ["test_email"],
    });

    // Safe response: booleans/codes only, never the API key, body, or sender
    // secret. 200 on success; on a real provider failure return the honest
    // outcome (429 for rate limits, otherwise 502) with a safe error message.
    if (result.emailed) {
      sendJson(res, 200, {
        ok: true,
        provider: result.provider,
        status: result.status,
        messageId: result.messageId,
        recipient: to,
      });
      return;
    }

    const httpStatus = result.status === "rate_limited" ? 429 : 502;
    sendJson(res, httpStatus, {
      ok: false,
      provider: result.provider,
      status: result.status,
      httpStatus: result.httpStatus,
      errorMessage: result.errorMessage,
      recipient: to,
    });
  });
}
