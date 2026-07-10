import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  sendJson,
  getJsonBody,
  assertPayloadSize,
  getClientIp,
  optionalString,
} from "../_lib/http.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import { completePasswordReset } from "../../backend/lib/passwordReset.js";

/**
 * POST /api/auth/complete-password-reset
 *
 * Public. Body: { token, password, confirmPassword? }. Verifies the one-time
 * token (hash, expiry, unused), then updates the Supabase Auth password with
 * the service role and marks the token used.
 */

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);

    const ip = getClientIp(req);
    const limit = checkRateLimit(ip, "password_reset_complete");
    if (!limit.allowed) {
      sendJson(res, 429, { ok: false, error: "Too many requests. Please try again later." });
      return;
    }

    const body = getJsonBody(req);
    const token = optionalString(body, "token") ?? "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : null;

    if (confirmPassword !== null && confirmPassword !== password) {
      sendJson(res, 400, {
        ok: false,
        code: "PASSWORD_MISMATCH",
        error: "Those passwords do not match. Please re-enter them.",
      });
      return;
    }

    const result = await completePasswordReset(token, password);

    if (!result.ok) {
      const status = result.code === "UPDATE_FAILED" ? 500 : 400;
      sendJson(res, status, { ok: false, code: result.code, error: result.message });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      message: "Your password has been updated. You can sign in now.",
    });
  });
}
