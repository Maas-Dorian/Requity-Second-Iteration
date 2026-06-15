/*
 * REQUITY frontend config (example).
 *
 * Copy this file to `config.js` in the same folder and fill in your values, OR
 * inject `window.REQUITY_CONFIG` at deploy time (e.g. from Vercel env vars).
 *
 * EVERY value below is SAFE to expose in the browser. The Supabase anon key is
 * public by design and protected by Row Level Security. NEVER put the Supabase
 * service role key (or any other secret) in this file — it lives server-side
 * only, in Vercel environment variables used by the /api routes.
 *
 * If this config is missing/blank, the frontend runs as a pure static demo.
 * In production, leave demoMode = false so unauthenticated users are rejected.
 *
 * DO NOT COMMIT a `config.js` that contains real keys. Only `config.example.js`
 * (this file, with blank values) belongs in git. `config.js` is gitignored.
 *
 * The Supabase SERVICE ROLE key NEVER belongs in this file or anywhere in the
 * frontend — it is a server-only secret used exclusively by the /api routes.
 *
 * ---------------------------------------------------------------------------
 * LOCAL DEMO EXAMPLE (static UI, no backend) — copy into config.js if desired:
 *
 *   window.REQUITY_CONFIG = {
 *     demoMode: true,        // keep the static demo content, skip auth gates
 *     apiBaseUrl: "",
 *     supabaseUrl: "",
 *     supabaseAnonKey: "",
 *     frontendUrl: "",
 *   };
 *
 * PRODUCTION uses the blank placeholders below, filled with real PUBLIC values.
 * ---------------------------------------------------------------------------
 */
window.REQUITY_CONFIG = {
  // Demo fallback. Keep FALSE in production. When false, the agent and reviewer
  // dashboards require a real Supabase session (and the right role) to load
  // live data. Set true only for local/offline demos of the static UI.
  demoMode: false,

  // PREFERRED: base URL of the secure serverless API (Vercel functions in /api).
  // When set, ALL data reads/writes go through these routes (which use the
  // service role key server-side). Recommended production path.
  // e.g. "https://your-app.vercel.app/api"  or  "/api" when same-origin.
  apiBaseUrl: "",

  // From your Supabase project settings → API. Required for AUTH (sign in/up)
  // even when apiBaseUrl is set, because the browser talks to Supabase Auth
  // directly. Also used as a local demo fallback for data when apiBaseUrl is
  // blank. The anon key is public and safe to expose.
  supabaseUrl: "", // e.g. https://xxxxxxxx.supabase.co
  supabaseAnonKey: "", // public anon key ONLY — never the service role key

  // Public URL of this frontend (used when building shareable assessment links).
  frontendUrl: "", // e.g. https://your-app.vercel.app
};
