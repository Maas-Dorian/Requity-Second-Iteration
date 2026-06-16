/**
 * Generate frontend/shared/config.js at build time from public env vars.
 *
 * Runs during the Vercel build (see package.json "build"). Writes ONLY
 * browser-safe public values. After deploy you can verify it is served at:
 *   https://requity-second-iteration.vercel.app/frontend/shared/config.js
 *
 * SECURITY: this script never reads or writes the Supabase service role key or
 * the Brevo API key, and it never logs the anon key value (only whether it is
 * present). Those secrets are server-only env vars used by the /api routes.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const configPath = path.join(process.cwd(), "frontend", "shared", "config.js");

const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mobyejpzfrjrryqatnbr.supabase.co",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  frontendUrl: process.env.VERCEL_FRONTEND_URL || "https://requity-second-iteration.vercel.app",
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

if (!config.supabaseAnonKey) {
  console.warn("[config] WARNING: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
}
