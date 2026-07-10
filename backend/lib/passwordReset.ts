import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { sendAppEmail, EMAIL_SUBJECTS } from "./email.js";
import {
  buildRequityEmailHtml,
  buildPlainTextEmail,
  getPublicSiteUrl,
} from "./emailTemplate.js";

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
    logReset("PASSWORD_RESET_REQUESTED", { userFound: false });
    return;
  }

  const rawToken = generateRawToken();
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

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
    logReset("PASSWORD_RESET_TOKEN_INSERT_FAILED", {
      userFound: true,
      detail: insertError?.message ?? "no row returned",
    });
    return;
  }

  const resetUrl = `${getPublicSiteUrl()}/agent/update-password.html?token=${encodeURIComponent(rawToken)}`;
  const { html, text } = buildResetEmail(resetUrl);

  const result = await sendAppEmail({
    eventType: "password_reset_requested",
    // Keyed by the token ROW id (a uuid), never the raw token or its hash.
    eventKey: `password_reset_requested:${inserted.id}`,
    to: email,
    subject: EMAIL_SUBJECTS.passwordReset,
    html,
    text,
    tags: ["auth", "password-reset"],
    metadata: { tokenRowId: inserted.id },
  });

  logReset("PASSWORD_RESET_REQUESTED", {
    userFound: true,
    emailStatus: result.status,
    tokenRowId: inserted.id,
  });
}

export type CompletePasswordResetResult =
  | { ok: true }
  | { ok: false; code: "INVALID_TOKEN" | "WEAK_PASSWORD" | "UPDATE_FAILED"; message: string };

const INVALID_LINK_MESSAGE =
  "This reset link is invalid or expired. Request a new password reset link.";

/**
 * Verify a raw reset token and, when valid, update the Supabase Auth password
 * using the service role and mark the token used.
 */
export async function completePasswordReset(
  rawToken: string,
  password: string
): Promise<CompletePasswordResetResult> {
  const passwordError = validateNewPassword(password);
  if (passwordError) {
    return { ok: false, code: "WEAK_PASSWORD", message: passwordError };
  }

  const token = (rawToken ?? "").trim();
  if (!token || token.length < 20 || token.length > 128) {
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  const tokenHash = sha256Hex(token);
  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from(TOKENS_TABLE)
    .select("id, user_id, token_hash, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !row) {
    logReset("PASSWORD_RESET_COMPLETE_REJECTED", { reason: "token_not_found" });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  // Defense in depth: constant-time comparison of the stored hash.
  const stored = Buffer.from(String(row.token_hash), "utf8");
  const candidate = Buffer.from(tokenHash, "utf8");
  if (stored.length !== candidate.length || !timingSafeEqual(stored, candidate)) {
    logReset("PASSWORD_RESET_COMPLETE_REJECTED", { reason: "hash_mismatch" });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  if (row.used_at) {
    logReset("PASSWORD_RESET_COMPLETE_REJECTED", { reason: "token_used", tokenRowId: row.id });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }
  if (!row.expires_at || Date.parse(String(row.expires_at)) <= Date.now()) {
    logReset("PASSWORD_RESET_COMPLETE_REJECTED", { reason: "token_expired", tokenRowId: row.id });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  // Mark used FIRST (single use even if two requests race; the conditional
  // update means only one caller wins the token).
  const { data: consumed, error: consumeError } = await supabase
    .from(TOKENS_TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");

  if (consumeError || !consumed || consumed.length === 0) {
    logReset("PASSWORD_RESET_COMPLETE_REJECTED", { reason: "consume_race", tokenRowId: row.id });
    return { ok: false, code: "INVALID_TOKEN", message: INVALID_LINK_MESSAGE };
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(String(row.user_id), {
    password,
  });

  if (updateError) {
    // Re-open the token so the user can retry with the same link (the
    // password was NOT changed).
    await supabase.from(TOKENS_TABLE).update({ used_at: null }).eq("id", row.id);
    logReset("PASSWORD_RESET_UPDATE_FAILED", {
      tokenRowId: row.id,
      detail: (updateError.message ?? "").slice(0, 200),
    });
    return {
      ok: false,
      code: "UPDATE_FAILED",
      message: "We could not update your password. Please try again in a moment.",
    };
  }

  logReset("PASSWORD_RESET_COMPLETED", { tokenRowId: row.id });
  return { ok: true };
}
