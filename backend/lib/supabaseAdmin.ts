import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client (service role key).
 *
 * SERVER-SIDE ONLY. This client bypasses Row Level Security and must never be
 * imported into browser/frontend bundles.
 *
 * IMPORTANT: nothing here runs at import time. The client is created lazily
 * inside getSupabaseAdmin(), and env is read with process.env directly, so a
 * missing key NEVER crashes module initialization (which would surface on
 * Vercel as FUNCTION_INVOCATION_FAILED before any handler try/catch).
 */

/** Typed error so handlers can map a missing key to a clean JSON response. */
export class SupabaseConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SupabaseConfigError";
    this.code = code;
  }
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

let cached: SupabaseClient | null = null;

/**
 * Accepted service-role key env names, in priority order. Production should
 * set SUPABASE_SERVICE_ROLE_KEY; the aliases exist only so a deployment that
 * used an older name keeps working instead of failing with a 500.
 */
export const SERVICE_ROLE_KEY_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SERVICE_ROLE",
] as const;

/** True when the admin client can be constructed (URL + service key present). */
export function hasSupabaseAdminConfig(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!readEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")) missing.push("SUPABASE_URL");
  if (!readEnv(...SERVICE_ROLE_KEY_ENV_NAMES)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return { ok: missing.length === 0, missing };
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = readEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv(...SERVICE_ROLE_KEY_ENV_NAMES);
  if (!url) {
    throw new SupabaseConfigError("MISSING_SUPABASE_PUBLIC_CONFIG", "SUPABASE_URL is not set.");
  }
  if (!serviceRoleKey) {
    throw new SupabaseConfigError(
      "MISSING_SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY is not set."
    );
  }
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const supabaseAdmin = getSupabaseAdmin;
