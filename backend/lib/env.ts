/**
 * Centralized environment access for the REQUITY backend.
 *
 * Each value supports an optional `NEXT_PUBLIC_` / `VITE_` fallback so the same
 * names work whether this code runs server-side or is bundled into a frontend
 * framework later on Vercel.
 */

function read(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[REQUITY] Missing required environment variable: ${name}. See backend/.env.example.`
    );
  }
  return value;
}

function has(...keys: string[]): boolean {
  return read(...keys) !== undefined;
}

/**
 * The production public origin. All user-facing share/QR/email links must use
 * this unless a VALID custom production origin is configured.
 */
export const PRODUCTION_SITE_URL = "https://www.requityapp.com";

/**
 * Origins that must NEVER be used for generated user-facing links:
 *   - the deleted preview deployment (old *.vercel.app host)
 *   - any localhost / loopback address
 * If one of these is found in env (e.g. a stale VERCEL_FRONTEND_URL), we ignore
 * it and fall back to the production domain so links never point at a dead host.
 */
const UNUSABLE_ORIGIN = /(requity-second-iteration\.vercel\.app|localhost|127\.0\.0\.1)/i;

/** True when `value` is a usable public origin (not empty, not dead/preview/localhost). */
export function isUsablePublicOrigin(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length > 0 && !UNUSABLE_ORIGIN.test(v);
}

/** Resolve any candidate origin to a clean, production-safe value (no trailing slash). */
export function normalizePublicOrigin(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return (isUsablePublicOrigin(v) ? v : PRODUCTION_SITE_URL).replace(/\/$/, "");
}

// --- Non-throwing readers (safe for handlers/health endpoints) -------------

/** Read an env var (with optional fallbacks). Returns null when unset. Never throws. */
export function getOptionalEnv(...keys: string[]): string | null {
  return read(...keys) ?? null;
}

/** True when any of the given env keys is set. Never throws. */
export function hasEnv(...keys: string[]): boolean {
  return has(...keys);
}

/** Booleans-only snapshot of the auth/integration env. Safe to return/log. */
export function getRequiredEnvStatus(): {
  hasSupabaseUrl: boolean;
  hasSupabaseAnonKey: boolean;
  hasSupabaseServiceRoleKey: boolean;
  hasBrevoApiKey: boolean;
} {
  return {
    hasSupabaseUrl: has("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"),
    hasSupabaseAnonKey: has("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    hasSupabaseServiceRoleKey: has("SUPABASE_SERVICE_ROLE_KEY"),
    hasBrevoApiKey: has("BREVO_API_KEY"),
  };
}

/**
 * Booleans-only snapshot of the Brevo/email config. Safe to return from the
 * email health endpoint, never includes the key or sender values themselves.
 *
 * `canSendConfigured` is true when an API key is present AND a sender email is
 * resolvable. The sender email/name fall back to project-approved defaults
 * (REQUITY / hello@requityapp.com), so the only hard requirement for live
 * sending is the API key.
 */
export function getEmailConfigStatus(): {
  hasBrevoApiKey: boolean;
  hasSenderEmail: boolean;
  hasSenderName: boolean;
  hasPublicSiteUrl: boolean;
  hasReviewNotificationEmail: boolean;
  canSendConfigured: boolean;
  /** Safe to expose, a public, non-secret site origin used in email CTAs. */
  publicSiteUrl: string;
} {
  const hasBrevoApiKey = has("BREVO_API_KEY");
  return {
    hasBrevoApiKey,
    // A sender email/name are always resolvable (env override OR approved
    // default), so these are always true. canSendConfigured therefore only
    // truly requires the API key.
    hasSenderEmail: true,
    hasSenderName: true,
    hasPublicSiteUrl: has("PUBLIC_SITE_URL", "NEXT_PUBLIC_SITE_URL", "VERCEL_FRONTEND_URL"),
    hasReviewNotificationEmail: has("REQUITY_REVIEW_EMAIL", "ADMIN_NOTIFICATION_EMAIL"),
    // A sender email is always resolvable (env override or approved default),
    // so live sending only requires the API key.
    canSendConfigured: hasBrevoApiKey,
    publicSiteUrl: env.publicSiteUrl.replace(/\/$/, ""),
  };
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Variables that MUST be set for the server to work in production. */
export const PRODUCTION_REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_FRONTEND_URL",
] as const;

/** Variables the server-side API routes need to talk to Supabase. */
export const SERVER_REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Optional integrations, warned about, never fatal. */
export const OPTIONAL_ENV = ["BREVO_API_KEY"] as const;

/** Public values that are SAFE to expose to the browser. */
export const FRONTEND_SAFE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_API_BASE_URL",
] as const;

/** Secrets that must NEVER be exposed to the browser. */
export const NEVER_FRONTEND_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "BREVO_API_KEY",
] as const;

export type EnvReport = {
  environment: "production" | "development";
  isProduction: boolean;
  hasSupabaseUrl: boolean;
  hasSupabaseAnonKey: boolean;
  /** Server-side only signal, presence boolean, never the value. */
  hasSupabaseServiceRoleKey: boolean;
  hasBrevoApiKey: boolean;
  hasFrontendUrl: boolean;
};

/**
 * Booleans-only snapshot of which env vars are configured. Safe to return from
 * health endpoints, it never includes any secret value.
 */
export function getEnv(): EnvReport {
  return {
    environment: isProduction() ? "production" : "development",
    isProduction: isProduction(),
    hasSupabaseUrl: has("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"),
    hasSupabaseAnonKey: has("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    hasSupabaseServiceRoleKey: has("SUPABASE_SERVICE_ROLE_KEY"),
    hasBrevoApiKey: has("BREVO_API_KEY"),
    hasFrontendUrl: has("VERCEL_FRONTEND_URL", "NEXT_PUBLIC_FRONTEND_URL", "VITE_FRONTEND_URL"),
  };
}

/**
 * Ensure the variables required for server/API operation are present.
 * Throws a clear error listing what is missing. Returns the resolved values.
 */
export function requireServerEnv(): { supabaseUrl: string; supabaseServiceRoleKey: string } {
  const supabaseUrl = read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = read("SUPABASE_SERVICE_ROLE_KEY");
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(
      `[REQUITY] Missing required server env: ${missing.join(", ")}. See .env.example / SETUP_SUPABASE_VERCEL.md.`
    );
  }
  return { supabaseUrl: supabaseUrl!, supabaseServiceRoleKey: supabaseServiceRoleKey! };
}

/**
 * In production, throw if any production-required variable is missing. Warns
 * (does not throw) for optional integrations. No-op outside production.
 * Returns a report so callers can log it.
 */
export function requireProductionEnv(): { ok: boolean; missing: string[]; warnings: string[] } {
  const missing = PRODUCTION_REQUIRED_ENV.filter((k) => !has(k));
  const warnings = OPTIONAL_ENV.filter((k) => !has(k)).map(
    (k) => `${k} is not set, related features run in a degraded/test mode.`
  );

  if (isProduction()) {
    for (const w of warnings) console.warn(`[REQUITY] ${w}`);
    if (missing.length) {
      throw new Error(
        `[REQUITY] Missing required production env: ${missing.join(", ")}. See SETUP_SUPABASE_VERCEL.md.`
      );
    }
  }
  return { ok: missing.length === 0, missing, warnings };
}

/**
 * Guard against leaking secrets to the browser: fail if a secret has been
 * mistakenly exposed under a public (`NEXT_PUBLIC_`/`VITE_`) prefix, or if a
 * secret value happens to match a public value. Throws on the first problem.
 */
export function assertNoFrontendSecrets(): void {
  const problems: string[] = [];

  // 1) Secrets must not be re-exported under a public prefix.
  for (const secret of NEVER_FRONTEND_ENV) {
    for (const prefix of ["NEXT_PUBLIC_", "VITE_"]) {
      const key = prefix + secret;
      if (has(key)) problems.push(`${key} exposes a secret to the browser, remove it.`);
    }
  }

  // 2) A public value must never equal a known secret value.
  const serviceRole = read("SUPABASE_SERVICE_ROLE_KEY");
  const brevo = read("BREVO_API_KEY");
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (!name.startsWith("NEXT_PUBLIC_") && !name.startsWith("VITE_")) continue;
    if (serviceRole && value.trim() === serviceRole) {
      problems.push(`${name} contains the Supabase service role key, never expose it.`);
    }
    if (brevo && value.trim() === brevo) {
      problems.push(`${name} contains the Brevo API key, never expose it.`);
    }
  }

  if (problems.length) {
    throw new Error(`[REQUITY] Frontend secret exposure detected:\n - ${problems.join("\n - ")}`);
  }
}

export const env = {
  get supabaseUrl(): string {
    return required(
      "SUPABASE_URL",
      read("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL")
    );
  },
  get supabaseAnonKey(): string {
    return required(
      "SUPABASE_ANON_KEY",
      read("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    );
  },
  get supabaseServiceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY", read("SUPABASE_SERVICE_ROLE_KEY"));
  },
  get brevoApiKey(): string | undefined {
    return read("BREVO_API_KEY");
  },
  get brevoSenderEmail(): string {
    // Must be a sender verified in Brevo. Override via BREVO_SENDER_EMAIL.
    return read("BREVO_SENDER_EMAIL") ?? "notifications@requityapp.com";
  },
  get brevoSenderName(): string {
    return read("BREVO_SENDER_NAME") ?? "REQUITY";
  },
  /**
   * Optional reviewer/admin fallback recipient for notifications that have no
   * assigned agent (e.g. a direct/reviewer-queue client completing the
   * assessment). Returns null when not configured. Never throws.
   */
  get reviewNotificationEmail(): string | null {
    return read("REQUITY_REVIEW_EMAIL", "ADMIN_NOTIFICATION_EMAIL") ?? null;
  },
  get frontendUrl(): string {
    return (
      read("VERCEL_FRONTEND_URL", "NEXT_PUBLIC_FRONTEND_URL", "VITE_FRONTEND_URL") ??
      "http://localhost:3000"
    );
  },
  /**
   * Public, branded site origin used for clean agent slug links
   * (e.g. https://www.requityapp.com/<slug>). Resolution order:
   *   PUBLIC_SITE_URL  →  VERCEL_FRONTEND_URL/etc  →  localhost default.
   * The clean-link rewrite must be served from this origin (see vercel.json).
   */
  get publicSiteUrl(): string {
    // A stale VERCEL_FRONTEND_URL pointing at the deleted preview deployment (or
    // a localhost value) is ignored here so share/QR/email links are always the
    // live production domain.
    return normalizePublicOrigin(
      read(
        "PUBLIC_SITE_URL",
        "NEXT_PUBLIC_SITE_URL",
        "VERCEL_FRONTEND_URL",
        "NEXT_PUBLIC_FRONTEND_URL",
        "VITE_FRONTEND_URL"
      )
    );
  },
};
