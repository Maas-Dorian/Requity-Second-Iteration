/**
 * Generate frontend/shared/config.js at build time from public env vars.
 *
 * Runs during the Vercel build (see package.json "build"). It writes ONLY the
 * browser-safe public values (apiBaseUrl, Supabase URL + anon key, frontend URL).
 *
 * SECURITY: this script never reads or writes the Supabase service role key or
 * the Brevo API key. Those are server-only env vars used by the /api routes and
 * must never appear in any browser-served file.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const OUTPUT_PATH = path.join(__dirname, "..", "frontend", "shared", "config.js");

const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  frontendUrl: process.env.VERCEL_FRONTEND_URL || "",
};

const banner =
  "/*\n" +
  " * AUTO-GENERATED at build time by scripts/generate-config.js — DO NOT EDIT.\n" +
  " * Values come from public NEXT_PUBLIC_* env vars. Browser-safe only.\n" +
  " * Never contains the Supabase service role key or the Brevo API key.\n" +
  " */\n";

const contents = banner + "window.REQUITY_CONFIG = " + JSON.stringify(config, null, 2) + ";\n";

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, contents, "utf8");

const missing = [];
if (!config.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!config.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

console.log("[generate-config] wrote " + path.relative(path.join(__dirname, ".."), OUTPUT_PATH));
if (missing.length) {
  console.warn(
    "[generate-config] WARNING: missing public env vars (" +
      missing.join(", ") +
      "). config.js was written with empty values — the dashboards need real Supabase public values to work."
  );
}
