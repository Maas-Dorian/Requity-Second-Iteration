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
import { trackServerEvent, ANALYTICS_EVENTS } from "../../backend/lib/vercelAnalytics.js";

/** Map internal reset failure codes to safe analytics categories. */
function resetFailureCategory(code: string | null | undefined): string {
  switch (code) {
    case "INVALID_TOKEN":
      return "invalid_token";
    case "EXPIRED_TOKEN":
      return "expired_token";
    case "USED_TOKEN":
      return "used_token";
    case "WEAK_PASSWORD":
    case "PASSWORD_MISMATCH":
    case "SAME_PASSWORD":
      return "weak_password";
    case "UPDATE_FAILED":
    case "CONFIG_MISSING":
    case "TABLE_MISSING":
      return "server";
    default:
      return "unknown";
  }
}

/**
 * POST /api/auth/complete-password-reset
 *
 * Public. Body: { token, password, confirmPassword? }. Verifies the one-time
 * token (hash, expiry, unused), then updates the Supabase Auth password with
 * the service role and marks the token used.
 *
 * Status mapping:
 *   400  every normal user problem: missing/invalid/expired/used token, weak
 *        password, password mismatch, password same as before
 *   500  true server/config failure only (missing env, missing table,
 *        unexpected Supabase admin error) with safe JSON:
 *        { ok: false, error: "password_reset_failed" }
 */

const ROUTE = "auth/complete-password-reset";

/** Codes that mean the SERVER is broken (500); everything else is a 400. */
const SERVER_FAILURE_CODES = new Set(["UPDATE_FAILED", "CONFIG_MISSING", "TABLE_MISSING"]);

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);

    console.log(`api:start ${ROUTE}`);

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

    // Presence flags only; never the values.
    console.log(
      `${ROUTE} input`,
      JSON.stringify({
        hasToken: Boolean(token),
        hasPassword: Boolean(password),
        hasConfirmPassword: confirmPassword !== null,
      })
    );

    if (!token) {
      sendJson(res, 400, {
        ok: false,
        code: "INVALID_TOKEN",
        error: "This reset link is invalid or expired. Request a new password reset link.",
      });
      return;
    }
    if (!password) {
      sendJson(res, 400, {
        ok: false,
        code: "WEAK_PASSWORD",
        error: "Enter a new password.",
      });
      return;
    }
    if (confirmPassword !== null && confirmPassword !== password) {
      sendJson(res, 400, {
        ok: false,
        code: "PASSWORD_MISMATCH",
        error: "Those passwords do not match. Please re-enter them.",
      });
      return;
    }

    let result;
    try {
      result = await completePasswordReset(token, password);
    } catch (error) {
      // Unexpected throw (e.g. database unavailable): safe 500, never a crash
      // page and never internals in the response.
      const err = error as { message?: string; code?: string };
      console.error(
        `${ROUTE} unexpected failure`,
        JSON.stringify({
          failingStep: "completePasswordReset",
          errorCode: typeof err?.code === "string" ? err.code : null,
          detail: (err?.message ?? "unknown").slice(0, 200),
        })
      );
      console.log(`api:done ${ROUTE} status=500`);
      sendJson(res, 500, { ok: false, error: "password_reset_failed" });
      return;
    }

    if (!result.ok) {
      const isServerFailure = SERVER_FAILURE_CODES.has(result.code);
      const status = isServerFailure ? 500 : 400;
      console.log(`api:done ${ROUTE} status=${status} code=${result.code}`);
      await trackServerEvent(ANALYTICS_EVENTS.PASSWORD_RESET_FAILED, {
        failure_category: resetFailureCategory(result.code),
      });
      if (isServerFailure) {
        sendJson(res, 500, { ok: false, error: "password_reset_failed", code: result.code });
        return;
      }
      sendJson(res, status, { ok: false, code: result.code, error: result.message });
      return;
    }

    console.log(`api:done ${ROUTE} status=200`);
    await trackServerEvent(ANALYTICS_EVENTS.PASSWORD_RESET_COMPLETED, { user_type: "agent" });
    sendJson(res, 200, {
      ok: true,
      message: "Your password has been updated. You can sign in now.",
    });
  });
}
