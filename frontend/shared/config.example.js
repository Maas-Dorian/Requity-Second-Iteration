/*
 * REQUITY frontend config (example).
 *
 * Copy this file to `config.js` in the same folder and fill in your values, OR
 * inject `window.REQUITY_CONFIG` at deploy time. Real Supabase credentials are
 * REQUIRED, the agent and reviewer dashboards need a real Supabase Auth session,
 * and the assessment flows call the secure /api routes. There is no demo mode.
 *
 * Every value below is SAFE to expose in the browser:
 *  - apiBaseUrl should usually be "/api".
 *  - supabaseUrl and supabaseAnonKey are the safe, public browser values from
 *    your Supabase project (Settings → API). The anon key is protected by RLS.
 *
 * NEVER put secrets here:
 *  - never put SUPABASE_SERVICE_ROLE_KEY in this file.
 *  - never put BREVO_API_KEY in this file.
 *  Those are server-only env vars used by the /api routes.
 *
 * Create `frontend/shared/config.js` locally (or in deployment) with your real
 * public values. `frontend/shared/config.js` is gitignored and must NOT be
 * committed. If config is missing, treat the setup as incomplete and use the
 * health endpoints (/api/health, /api/health/supabase) to verify it.
 */
window.REQUITY_CONFIG = {
  apiBaseUrl: "/api",
  supabaseUrl: "",
  // supabaseAnonKey is the PUBLIC anon key only (Supabase → Settings → API).
  // It is protected by RLS and safe for the browser.
  // NEVER put the Supabase service role key here.
  // NEVER put Brevo (or any other server) keys here.
  supabaseAnonKey: "",
  frontendUrl: ""
};
