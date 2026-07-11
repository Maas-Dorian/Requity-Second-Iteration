import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "./supabaseAdmin.js";
import { sendAppEmail, EMAIL_SUBJECTS, resolveEmailProvider } from "./email.js";
import {
  buildRequityEmailHtml,
  buildPlainTextEmail,
  getPublicSiteUrl,
} from "./emailTemplate.js";
import { getOptionalEnv } from "./env.js";
import { isMissingTableError } from "./supabaseWrite.js";

/**
 * REQUITY-owned password reset flow (server-side ONLY).
 *
 * Flow:
 *   1. requestPasswordReset(email): finds the Supabase Auth user, stores a
 *      HASH of a fresh one-time token, and emails the raw token inside a
 *      reset link via the existing REQUITY email system (SendGrid).
 *   2. completePasswordReset(token, password): verifies hash + expiry +
 *      unused, updates the Supabase Auth password with the service role, and
 *      marks the token used.
 *
 * Security invariants:
 *   - Raw tokens are NEVER stored or logged; only SHA-256 hashes persist.
 *   - Tokens are single use and expire after TOKEN_TTL_MINUTES.
 *   - requestPasswordReset never reveals whether an account exists.
 *   - Passwords are never logged and never stored outside Supabase Auth.
 */

const TOKEN_TTL_MINUTES = 60;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const TOKENS_TABLE = "auth_password_reset_tokens";

/** Safe structured logging. Never includes raw tokens, passwords, or emails. */
function logReset(tag: string, fields: Record<string, unknown>): void {
  try {
    console.log(tag, JSON.stringify(fields));
  } catch {
    console.log(tag, fields);
  }
}

/** Mask an email for logs: "j***@example.com". Never logs the full local part. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}

/**
 * Log (server-side only) which env vars the reset email flow depends on are
 * missing. SENDGRID_SENDER_EMAIL / _NAME and the site URL have safe code
 * defaults, so only the hard requirements are treated as blocking. Never
 * exposes any value; names only.
 */
export function logPasswordResetConfig(): void {
  const missing: string[] = [];
  if (!getOptionalEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL")) {
    missing.push("SUPABASE_URL");
  }
  if (!getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (resolveEmailProvider() === "sendgrid" && !getOptionalEnv("SENDGRID_API_KEY")) {
    missing.push("SENDGRID_API_KEY");
  }
  if (missing.length) {
    console.error(`password-reset:missing-env ${missing.join(", ")}`);
  }
  const optionalMissing: string[] = [];
  if (!getOptionalEnv("SENDGRID_SENDER_EMAIL")) optionalMissing.push("SENDGRID_SENDER_EMAIL");
  if (!getOptionalEnv("SENDGRID_SENDER_NAME")) optionalMissing.push("SENDGRID_SENDER_NAME");
  if (!getOptionalEnv("PUBLIC_SITE_URL", "VERCEL_FRONTEND_URL")) {
    optionalMissing.push("PUBLIC_SITE_URL|VERCEL_FRONTEND_URL");
  }
  if (optionalMissing.length) {
    logReset("PASSWORD_RESET_CONFIG", {
      usingDefaultsFor: optionalMissing,
      provider: resolveEmailProvider(),
    });
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Cryptographically random, URL-safe raw token (256 bits of entropy). */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Validate a candidate password. Returns a user-safe error or null when ok. */
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Enter a new password.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Choose a password with at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/**
 * Find the Supabase Auth user id for an email. Checks the profiles table
 * first (profiles.id = auth.users.id), then falls back to the paginated
 * admin listUsers API. Returns null when no account exists.
 */
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profile?.id) return profile.id as string;

  // Fallback for auth users without a profiles row yet.
  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      logReset("PASSWORD_RESET_LOOKUP_ERROR", { area: "auth.admin.listUsers", page });
      return null;
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (users.length < perPage) break;
  }
  return null;
}

/** Build the branded reset email (HTML + text). The raw token appears ONLY in the URL. */
function buildResetEmail(resetUrl: string): { html: string; text: string } {
  const content = {
    title: "Reset your REQUITY password",
    intro:
      "We received a request to reset the password for your REQUITY account. " +
      "Use the button below to choose a new password. This link expires in 60 minutes " +
      "and can only be used once. If you did not request this, you can ignore this email " +
      "and your password will stay the same.",
    ctaLabel: "Choose a new password",
    ctaUrl: resetUrl,
  };
  return {
    html: buildRequityEmailHtml(content),
    text: buildPlainTextEmail(content),
  };
}

export type RequestPasswordResetParams = {
  /** Already-normalized (trimmed, lowercased) email. */
  email: string;
  requestedIp?: string | null;
  userAgent?: string | null;
};

/**
 * Handle a reset request. Silent no-op (from the caller's perspective) when
 * the email has no account; the API route always returns the same generic
 * success message either way.
 */
export async function requestPasswordReset(params: RequestPasswordResetParams): Promise<void> {
  const email = params.email;
  const supabase = getSupabaseAdmin();

  const userId = await findAuthUserIdByEmail(email);
  if (!userId) {
    logReset("PASSWORD_RESET_REQUESTED", { userFound: false, email: maskEmail(email) });
    return;
  }

  const rawToken = generateRawToken();
  const tokenHash = sha256Hex(rawToken);
  const createdAtMs = Date.now();
  const expiresAt = new Date(createdAtMs + TOKEN_TTL_MINUTES * 60_000).toISOString();

  // Safest simple policy: a new request invalidates all older unused tokens
  // for this user, so exactly one reset link is live at a time.
  await supabase
    .from(TOKENS_TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const { data: inserted, error: insertError } = await supabase
    .from(TOKENS_TABLE)
    .insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      requested_ip: params.requestedIp ?? null,
      user_agent: (params.userAgent ?? "").slice(0, 400) || null,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    // A missing table means migration 0013 was never applied to the live DB;
    // without the token row no reset email can be sent, so make the fix
    // unmissable in the logs.
    if (insertError && isMissingTableError(insertError)) {
      console.error(
        `password-reset:missing-table ${TOKENS_TABLE}. ` +
          "Run backend/supabase/migrations/0013_auth_password_reset_tokens.sql " +
          "in the Supabase SQL Editor. No reset email was sent."
      );
    }
    logReset("PASSWORD_RESET_TOKEN_INSERT_FAILED", {
      userFound: true,
      email: maskEmail(email),
      tokenCreated: false,
      detail: (insertError?.message ?? "no row returned").slice(0, 200),
    });
    return;
  }

  const resetUrl = `${getPublicSiteUrl()}/agent/update-password.html?token=${encodeURIComponent(rawToken)}`;
  const { html, text } = buildResetEmail(resetUrl);
  let resetUrlHost = "";
  try {
    resetUrlHost = new URL(resetUrl).host;
  } catch {
    /* host stays empty for logs */
  }

  const result = await sendAppEmail({
    eventType: "password_reset_requested",
    // Unique per REQUEST: token row id (uuid) + creation timestamp. Never the
    // raw token or its hash, and never a static per-email key, so repeated
    // reset requests are never blocked by dedupe.
    eventKey: `password_reset_requested:${inserted.id}:${createdAtMs}`,
    to: email,
    subject: EMAIL_SUBJECTS.passwordReset,
    html,
    text,
    tags: ["auth", "password-reset"],
    metadata: { userId, tokenId: inserted.id, purpose: "password_reset" },
  });

  logReset("PASSWORD_RESET_REQUESTED", {
    userFound: true,
    email: maskEmail(email),
    tokenCreated: true,
    tokenRowId: inserted.id,
    resetUrlHost,
    emailStatus: result.status,
    emailHttpStatus: result.httpStatus,
    hasProviderMessageId: Boolean(result.messageId),
    emailError: result.errorMessage,
  });
}

export type CompletePasswordResetResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * 400-class (user-fixable): INVALID_TOKEN, WEAK_PASSWORD, SAME_PASSWORD.
       * 500-class (server/config): CONFIG_MISSING, TABLE_MISSING, UPDATE_FAILED.
       */
      code:
        | "INVALID_TOKEN"
        | "WEAK_PASSWORD"
        | "SAME_PASSWORD"
        | "CONFIG_MISSING"
        | "TABLE_MISSING"
        | "UPDATE_FAILED";
      message: string;
    };

const INVALID_LINK_MESSAGE =
  "This reset link is invalid or expired. Request a new password reset link.";

/** Step-name logging for the completion flow. Never logs tokens, hashes, or passwords. */
function logStep(step: string, fields: Record<string, unknown> = {}): void {
  logReset("PASSWORD_RESET_COMPLETE_STEP", { step, ...fields });
}

/**
 * Classify a Supabase Auth admin update error. GoTrue returns 4xx statuses for
 * user-fixable problems (weak password per project policy, same password as
 * before); those must surface as 400s, not 500s.
 */
function classifyAuthUpdateError(error: {
  status?: number | null;
  message?: string | null;
  code?: string | null;
}): { code: "WEAK_PASSWORD" | "SAME_PASSWORD" | "INVALID_TOKEN" | "UPDATE_FAILED"; message: string } {
  const status = typeof error.status === "number" ? error.status : null;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("different from the old password") || error.code === "same_password") {
    return {
      code: "SAME_PASSWORD",
      message: "Your new password must be different from your old password.",
    };
  }
  if (message.includes("password") && (status === 400 || status === 422)) {
    return {
      code: "WEAK_PASSWORD",
      message: "That password does not meet the password requirements. Choose a longer or stronger password.",
    };
  }
  if (status === 404 || message.includes("user not found")) {
    // The auth user behind this token no longer exists; the link is dead.
    return { code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }
  return {
    code: "UPDATE_FAILED",
    message: "We could not update your password. Please try again in a moment.",
  };
}

/**
 * Verify a raw reset token and, when valid, update the Supabase Auth password
 * using the service role and mark the token used.
 *
 * Returns 400-class codes for every normal user problem (bad/expired/used
 * token, weak or reused password) and 500-class codes only for true server or
 * configuration failures (missing env, missing table, unexpected auth error).
 */
export async function completePasswordReset(
  rawToken: string,
  password: string
): Promise<CompletePasswordResetResult> {
  // --- Env check (500-class when missing; never crash with undefined errors) -
  const config = hasSupabaseAdminConfig();
  logStep("env check passed", { ok: config.ok });
  if (!config.ok) {
    console.error(`password-reset:missing-env ${config.missing.join(", ")}`);
    return {
      ok: false,
      code: "CONFIG_MISSING",
      message: "We could not update your password. Please try again later.",
    };
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    logStep("password validation", { ok: false });
    return { ok: false, code: "WEAK_PASSWORD", message: passwordError };
  }

  const token = (rawToken ?? "").trim();
  if (!token || token.length < 20 || token.length > 128) {
    logStep("token shape check", { ok: false });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  const tokenHash = sha256Hex(token);
  const supabase = getSupabaseAdmin();

  logStep("token hash lookup started");
  const { data: row, error } = await supabase
    .from(TOKENS_TABLE)
    .select("id, user_id, token_hash, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error && isMissingTableError(error)) {
    // Migration 0013 (or the 0016 repair) was never applied: config problem,
    // not a user problem. Make the fix unmissable in the logs.
    logStep("token table exists", { ok: false });
    console.error(
      `password-reset:missing-table ${TOKENS_TABLE}. ` +
        "Run backend/supabase/migrations/0016_repair_auth_reset_and_schema_drift.sql " +
        "in the Supabase SQL Editor."
    );
    return {
      ok: false,
      code: "TABLE_MISSING",
      message: "We could not update your password. Please try again later.",
    };
  }
  logStep("token table exists", { ok: true });

  if (error || !row) {
    logStep("token row found", {
      ok: false,
      errorCode: error ? ((error as { code?: string }).code ?? null) : null,
    });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }
  logStep("token row found", { ok: true });

  // Defense in depth: constant-time comparison of the stored hash.
  const stored = Buffer.from(String(row.token_hash), "utf8");
  const candidate = Buffer.from(tokenHash, "utf8");
  if (stored.length !== candidate.length || !timingSafeEqual(stored, candidate)) {
    logReset("PASSWORD_RESET_COMPLETE_REJECTED", { reason: "hash_mismatch" });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  if (row.used_at) {
    logStep("token already used", { ok: false, tokenRowId: row.id });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }
  logStep("token already used", { ok: true });

  if (!row.expires_at || Date.parse(String(row.expires_at)) <= Date.now()) {
    logStep("token expired", { ok: false, tokenRowId: row.id });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }
  logStep("token expired", { ok: true });
  logStep("user id exists", { ok: Boolean(row.user_id) });

  // Mark used FIRST (single use even if two requests race; the conditional
  // update means only one caller wins the token).
  logStep("mark token used started");
  const { data: consumed, error: consumeError } = await supabase
    .from(TOKENS_TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");

  if (consumeError || !consumed || consumed.length === 0) {
    logStep("mark token used success", { ok: false, reason: "consume_race" });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }
  logStep("mark token used success", { ok: true });

  logStep("supabase admin update started");
  const { error: updateError } = await supabase.auth.admin.updateUserById(String(row.user_id), {
    password,
  });

  if (updateError) {
    // Re-open the token so the user can retry with the same link (the
    // password was NOT changed).
    await supabase.from(TOKENS_TABLE).update({ used_at: null }).eq("id", row.id);
    const classified = classifyAuthUpdateError(updateError);
    logStep("supabase admin update success", {
      ok: false,
      failingStep: "auth.admin.updateUserById",
      classifiedAs: classified.code,
      errorStatus: (updateError as { status?: number }).status ?? null,
      detail: (updateError.message ?? "").slice(0, 200),
    });
    return { ok: false, code: classified.code, message: classified.message };
  }
  logStep("supabase admin update success", { ok: true });

  logReset("PASSWORD_RESET_COMPLETED", { tokenRowId: row.id });
  return { ok: true };
}
