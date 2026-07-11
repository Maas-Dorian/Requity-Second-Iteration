import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  sendJson,
  getJsonBody,
  assertPayloadSize,
  getClientIp,
  optionalString,
  isValidEmail,
} from "../_lib/http.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import {
  requestPasswordReset,
  logPasswordResetConfig,
} from "../../backend/lib/passwordReset.js";

/**
 * POST /api/auth/request-password-reset
 *
 * Public. Body: { email }. ALWAYS returns the same generic success message so
 * callers can never learn whether an account exists. When the account exists,
 * a REQUITY-branded reset email (SendGrid) is sent with a one-time link to
 * /agent/update-password.html?token=...
 */

const ROUTE = "/api/auth/request-password-reset";

const GENERIC_SUCCESS = {
  ok: true,
  message: "If an account exists for that email, we sent a password reset link.",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);

    console.log(`api:start ${ROUTE}`);
    // Server-side only: logs "password-reset:missing-env <names>" when the
    // flow cannot possibly send (never surfaced to the frontend).
    logPasswordResetConfig();

    const ip = getClientIp(req);
    const ipLimit = checkRateLimit(ip, "password_reset_request");
    if (!ipLimit.allowed) {
      sendJson(res, 429, { ok: false, error: "Too many requests. Please try again later." });
      return;
    }

    const body = getJsonBody(req);
    const email = (optionalString(body, "email") ?? "").trim().toLowerCase();

    // Invalid or missing email: same generic success, no lookup, no send.
    if (!email || !isValidEmail(email)) {
      sendJson(res, 200, GENERIC_SUCCESS);
      return;
    }

    // Per-email limit stops one address being flooded from many IPs.
    const emailLimit = checkRateLimit(email, "password_reset_email");
    if (!emailLimit.allowed) {
      // Still generic: silently skip the send instead of confirming anything.
      sendJson(res, 200, GENERIC_SUCCESS);
      return;
    }

    const userAgentHeader = req.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    try {
      await requestPasswordReset({ email, requestedIp: ip, userAgent: userAgent ?? null });
    } catch (error) {
      // Never surface internals; the response stays generic either way.
      console.error(`[api] ${ROUTE} failed:`, error instanceof Error ? error.message : error);
    }

    sendJson(res, 200, GENERIC_SUCCESS);
  });
}
