# REQUITY — Deploy Ready Report

Status snapshot for the **first real deployment** to Supabase + Vercel.
Generated from a structure + typecheck review. No product behavior or UI changed.

Companion docs: `SETUP_SUPABASE_VERCEL.md` (setup), `DEPLOYMENT_CHECKLIST.md`
(verification), `FIRST_LIVE_TEST.md` (click-by-click), `backend/SEED_REVIEWER_ADMIN.md`
(first reviewer/admin), `backend/API_ROUTES.md` (API reference).

---

## 1. What is ready

**Build / project**
- [x] Root `package.json` (deps: `@supabase/supabase-js`; dev: `@vercel/node`,
      `typescript`, `@types/node`; `typecheck` script).
- [x] Root `tsconfig.json` (typechecks `api/**` + `backend/lib/**` + `backend/emails/**`).
- [x] `tsc --noEmit` passes for both root and `backend/tsconfig.json`.
- [x] Static frontend served from repo root (`agent/`, `client/`, `reviewer/`,
      `frontend/shared/`) — no build step required (Vercel "Other" preset).

**Vercel-compatible `api/` routes (20 functions)**
- [x] Health: `api/health.ts`, `api/health/supabase.ts`, `api/health/brevo.ts`
- [x] Auth: `api/auth/bootstrap-agent.ts`, `api/auth/me.ts`, `api/auth/logout.ts`
- [x] Client assessment: `api/client-assessment/create.ts`, `api/client-assessment/submit.ts`
- [x] Assessment leads: `api/assessment-leads/start.ts`, `api/assessment-leads/progress.ts`, `api/assessment-leads/complete.ts`
- [x] Reviewer: `api/reviewer/matches.ts`, `api/reviewer/approve-match.ts`, `api/reviewer/assessment-leads.ts`, `api/reviewer/assessment-leads/update.ts`
- [x] Dashboard: `api/dashboard/agent.ts`, `api/messages/list.ts`, `api/messages/mark-read.ts`
- [x] Agent assessment: `api/agent-assessment/submit.ts`
- [x] Shared HTTP helpers: `api/_lib/http.ts`

**Database**
- [x] `backend/supabase/schema.sql` — fresh-project ready, re-run safe
      (`create extension if not exists pgcrypto`, idempotent enum `DO` blocks,
      `create table if not exists`, `create index if not exists`,
      `drop policy/trigger if exists`), RLS enabled with production policies, and
      the `public.requity_role()` helper.

**Config / safety**
- [x] `.env.example` (root) — server-only vs public sections, secret warnings.
- [x] `frontend/shared/config.example.js` — public-only values, demo example,
      "never commit real keys" + "service role never in frontend" warnings.
- [x] `.gitignore` ignores `frontend/shared/config.js` (verified: no committed
      `config.js` exists in the repo).
- [x] Server secrets are read server-side only via `backend/lib/env.ts` /
      `supabaseAdmin.ts`; the service role key is never referenced by frontend code.

---

## 2. What still needs real credentials

The code is complete; deployment only needs **real values** for the env vars and
the frontend config below, plus running the SQL schema once.

| Item | Where | Required? |
| --- | --- | --- |
| Supabase project + `schema.sql` run | Supabase dashboard | **Yes** |
| Email Auth enabled | Supabase → Authentication | **Yes** |
| Server env vars | Vercel → Settings → Environment Variables | **Yes** |
| Public env vars | Vercel → Settings → Environment Variables | **Yes** |
| `frontend/shared/config.js` | created from example, public values | **Yes** |
| First reviewer/admin promotion | Supabase SQL editor | **Yes** (for reviewer flow) |
| Brevo key + verified sender | Vercel env | Optional (test mode until added) |

### Exact Supabase env vars needed
From Supabase → **Settings → API**:
- `SUPABASE_URL` — Project URL
- `SUPABASE_ANON_KEY` — anon `public` key
- `SUPABASE_SERVICE_ROLE_KEY` — `service_role` `secret` key (**server-only**)

### Exact Vercel env vars needed
**Server-side only (secrets):**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_FRONTEND_URL` (e.g. `https://your-app.vercel.app`)
- `BREVO_API_KEY` *(optional)*
- `BREVO_SENDER_EMAIL` *(optional, required for live email)*
- `BREVO_SENDER_NAME` *(optional)*

**Public (safe for browser):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (`/api`)

### Exact frontend config values needed (`frontend/shared/config.js`)
```js
window.REQUITY_CONFIG = {
  apiBaseUrl: "/api",
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY",       // public anon key ONLY
  frontendUrl: "https://YOUR-APP.vercel.app",
};
```
> Never place `SUPABASE_SERVICE_ROLE_KEY` or `BREVO_API_KEY` in this file.

---

## 3. Order to deploy
1. Create the Supabase project; copy URL + anon + service_role keys.
2. Supabase → Authentication → enable **Email** (optionally disable email confirm
   for the first run).
3. Supabase → SQL Editor → run `backend/supabase/schema.sql` (expect "Success").
4. Push the repo to Git and import it into Vercel (framework: **Other**).
5. Add all Vercel env vars (server + public) for Production.
6. Create `frontend/shared/config.js` from the example with real public values.
7. Deploy (or redeploy after env + config are set).
8. Verify health endpoints (see "Order to test").
9. Create the first agent account, then promote a reviewer/admin in Supabase SQL.

## 4. Order to test
1. **Health (no auth):**
   - `GET /api/health` → `ok:true`, env booleans correct.
   - `GET /api/health/supabase` → `ok:true, profilesReachable:true`.
   - `GET /api/health/brevo` → `configured:true` or `testMode:true` (both `ok:true`).
2. **Auth:** agent sign-up → dashboard loads own data; sign-in routing by role;
   unauthenticated protected calls return 401 in production.
3. **Reviewer/admin:** promote via SQL; reviewer dashboard loads; an `agent` is
   blocked with the Access Restricted screen.
4. **QR client flow:** open agent link → complete → client appears on the agent
   dashboard (not routed to reviewer queue).
5. **Incomplete lead flow:** start an assessment, abandon → lead appears in the
   reviewer **Incomplete Assessments** section.
6. **Reviewer approve match:** approve → agent gets the **REQUITY Client Match**
   badge + the exact notification (and Brevo email if live).
7. Full click-by-click in `FIRST_LIVE_TEST.md`.

---

## 5. Known limitations
- **Brevo is in test mode** until `BREVO_API_KEY` (+ verified `BREVO_SENDER_EMAIL`)
  is set. In test mode emails are logged, not sent; all flows still succeed and
  `/api/health/brevo` returns `testMode:true`.
- **Rate limiting is in-memory** (`backend/lib/rateLimit.ts`), a per-instance
  best-effort limiter. It resets on cold starts and is not shared across Vercel
  instances. Swap for Upstash Redis / a Supabase-backed limiter for real abuse
  protection at scale.
- **Do not commit `frontend/shared/config.js`** — it is gitignored. Only
  `config.example.js` (blank) belongs in git. Real keys live in the deployed
  `config.js` / env vars.
- **Old schema projects:** `schema.sql` guards prevent errors and duplicates on
  re-run, but they will NOT add new columns to pre-existing tables. If a project
  ran an older schema, either start a **fresh Supabase project** or apply the
  missing columns manually with `ALTER TABLE`.
- **No demo mode:** real Supabase credentials are required everywhere. Protected
  API routes reject unauthenticated calls (401) and wrong roles (403), and the
  agent/reviewer dashboards require a real Supabase Auth session. Missing config
  is treated as setup incomplete — verify with the health endpoints.
- **Reviewer dashboard is live-only:** the reviewer matching queue no longer
  shows any demo/sample data and there is no "Run Demo" tour. The queue is
  populated only from `GET /api/reviewer/matches` and renders one of three
  states — live matches, a clean empty state ("No pending matches yet."), or a
  clean error state ("We couldn't load reviewer matches. Please try again.").
  Approvals (and the optional Auto run) call `POST /api/reviewer/approve-match`;
  no client-side scheduling is simulated. The **Incomplete Assessments** section
  remains live via `GET /api/reviewer/assessment-leads`.
- **Agent weekly chart is illustrative:** the "Assessment activity" bar chart on
  the agent dashboard still uses static placeholder values and is illustrative
  only (no wording implies it is live/real-time). It stays as-is until per-day
  activity analytics are added to the dashboard API.

---

## 6. Verification at report time
- `tsc --noEmit` (root): **pass**
- `tsc --noEmit -p backend/tsconfig.json`: **pass**
- API route files present: **20/20**
- `frontend/shared/config.js` committed: **none** (correctly gitignored)

**Overall: READY for first deployment** once the Supabase project, env vars, and
`config.js` are populated with real values per sections 2–3.
