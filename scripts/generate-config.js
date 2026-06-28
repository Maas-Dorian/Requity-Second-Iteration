/**
 * Generate frontend/shared/config.js at build time from public env vars.
 *
 * Runs during the Vercel build (see package.json "build"). Writes ONLY
 * browser-safe public values. After deploy you can verify it is served at:
 *   https://www.requityapp.com/frontend/shared/config.js
 *
 * ESM module (package.json has "type": "module").
 *
 * SECURITY: this script never reads or writes the Supabase service role key or
 * the Brevo API key, and it never logs the anon key value (only whether it is
 * present). Those secrets are server-only env vars used by the /api routes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const configPath = path.join(rootDir, "frontend", "shared", "config.js");

const PRODUCTION_SITE_URL = "https://www.requityapp.com";
// A stale VERCEL_FRONTEND_URL pointing at the deleted preview deployment (or a
// localhost value) must never be baked into the browser config, or share links
// would point at a dead host. Such values are ignored in favor of production.
const UNUSABLE_ORIGIN = /(requity-second-iteration\.vercel\.app|localhost|127\.0\.0\.1)/i;
function normalizeSiteUrl(value) {
  const v = (value || "").trim();
  return (v && !UNUSABLE_ORIGIN.test(v) ? v : PRODUCTION_SITE_URL).replace(/\/$/, "");
}

// The Supabase URL and ANON key are PUBLIC, browser-safe values. Prefer the
// NEXT_PUBLIC_* names, but fall back to the server names so a project that only
// set SUPABASE_URL / SUPABASE_ANON_KEY still produces a working frontend config.
// NEVER fall back to SUPABASE_SERVICE_ROLE_KEY or any secret here.
const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://mobyejpzfrjrryqatnbr.supabase.co",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  frontendUrl: normalizeSiteUrl(process.env.VERCEL_FRONTEND_URL),
  // Public, branded origin for clean agent slug links (e.g. www.requityapp.com).
  // Prefers PUBLIC_SITE_URL -> NEXT_PUBLIC_SITE_URL -> VERCEL_FRONTEND_URL, and
  // ignores the deleted preview deployment / localhost in favor of production.
  publicSiteUrl: normalizeSiteUrl(
    process.env.PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_FRONTEND_URL
  ),
  // Whether Supabase Auth email confirmation is expected to be ON. Public,
  // non-secret hint used ONLY to shape the signup UX (it does not change auth).
  // Default false (testing-friendly): signup is expected to return a session.
  // Set AUTH_EMAIL_CONFIRMATION_EXPECTED=true if you keep "Confirm email" ON.
  authEmailConfirmationExpected:
    String(process.env.AUTH_EMAIL_CONFIRMATION_EXPECTED || "").toLowerCase() === "true",
};

fs.mkdirSync(path.dirname(configPath), { recursive: true });

fs.writeFileSync(
  configPath,
  `window.REQUITY_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);

console.log("[config] frontend/shared/config.js generated");
console.log("[config] apiBaseUrl:", config.apiBaseUrl);
console.log("[config] supabaseUrl configured:", Boolean(config.supabaseUrl));
console.log("[config] supabaseAnonKey configured:", Boolean(config.supabaseAnonKey));
console.log("[config] frontendUrl:", config.frontendUrl);
console.log("[config] publicSiteUrl:", config.publicSiteUrl);
console.log("[config] authEmailConfirmationExpected:", config.authEmailConfirmationExpected);

if (!config.supabaseAnonKey) {
  console.warn("[config] WARNING: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
}
