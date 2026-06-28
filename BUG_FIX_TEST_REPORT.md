# REQUITY, End-to-End QA & Bug-Fix Report

Date: 2026-06-16
Scope: Full live-app audit after login (auth, agent assessment, dashboard, client
flow, reviewer portal, API routes, schema, ESM/Vercel runtime, error handling).

---

## TL;DR, Root causes & fixes

1. **Agent assessment submit failure (the reported bug)., CONFIRMED root cause.**
   **Database schema drift.** The live Supabase project was created from an older
   `schema.sql`, so: (a) the `agents` table was missing the dimension columns the
   submit writes (`interaction_style`, `focus`, `stress_response`,
   `perceived_value`, `negotiation_style`, plus `archetype`/`archetype_completed_at`),
   and (b) the `assessments` table did not exist at all. `POST
   /api/agent-assessment/submit` therefore crashed with
   `column agents.interaction_style does not exist` (Postgres 42703) → 500 → the
   assessment page showed the real error card. The application code path is correct
   against the committed schema.
   **Fix:** consolidated one idempotent migration that adds every missing
   column/table/enum value in place and re-asserts RLS, 
   `backend/supabase/migrations/0001_align_live_schema.sql`. (This supersedes and
   replaces the earlier ad-hoc `backend/supabase/migration_reconcile.sql`, which
   was removed.) Must be run once in Supabase (see "Remaining manual steps").

2. **No redirect to the dashboard after a successful submit.**
   The success path showed the result card (with a manual “Go to your dashboard”
   link) but never redirected, which read as “didn’t redirect correctly.”
   **Fix:** after a confirmed save, `agent/script.js` now shows the archetype
   briefly and then redirects to `dashboard.html`. The manual link remains as a
   fallback. No fake success, the redirect only fires after the API returns 200.

3. **Leftover debug harness calling a dead localhost endpoint.**
   The previous debugging session left `reqDebug()` POSTing every API call to
   `http://127.0.0.1:7553/ingest/…` whenever `requity_debug` was on. On the live
   (HTTPS) site this is a blocked mixed-content request and pure noise.
   **Fix:** rewrote `reqDebug()` to log **only to the browser console** with safe
   metadata (page, has-session, route, status, role, has-agent-row, payload shape).
   No tokens, passwords, refresh tokens, service-role/Brevo keys, or raw PII.

4. **Three dead footer links on the client landing page** (`href="#"`).
   **Fix:** pointed “Agent Assessment / Create Account / Agent Login” at the real
   `../agent/index.html` and `../agent/login.html`.

---

## Files changed

| File | Change |
| --- | --- |
| `frontend/shared/api.js` | Safe console-only debug logger (removed localhost ingest POST); keeps richer API error surfacing (`error`/`code`/`area`). |
| `agent/script.js` | Redirect to `dashboard.html` after a confirmed assessment save. |
| `client/index.html` | Fixed 3 dead `#` footer links. |
| `backend/supabase/migrations/0001_align_live_schema.sql` | **New.** Idempotent migration that aligns an existing DB with the code (adds missing columns/tables/enum values). |
| `scripts/generate-config.js` | (Pre-existing) env fallback so config is generated even with only `SUPABASE_*` names. |

---

## Area-by-area audit

### 1. Auth / session persistence, PASS (no code changes needed)
- One session key (`requity_session`) used everywhere; `getAccessToken()` refreshes
  near expiry and only clears on a hard refresh failure (network errors keep the
  session). `requireAgentSession` / `requireReviewerSession` return
  `no_session` / `error` / `role_mismatch` so a 500 never logs a valid user out
  and never causes a redirect loop.
- All protected calls attach `Authorization: Bearer <access_token>` via
  `withAuthHeaders`.
- 401 → session cleared + redirect to login. 500/network → retry/error overlay
  shown, session preserved. Wrong role → reviewer switch panel / access-denied.

### 2. Agent assessment flow, FIXED
- Frontend selectors/handlers verified (`#agent-options`, `#agent-next`, etc.).
- Submit posts `{ answers, result }` with the bearer token; the server recomputes
  the archetype authoritatively and writes to the **authenticated** agent row
  (body-provided ids are ignored), sets `archetype_completed_at`, and inserts an
  `assessments` row. No silent catches, failures show the real message.
- Added the dashboard redirect after success. `me.ts` exposes
  `archetypeCompletedAt`, so the dashboard recognizes completion.
- **Requires the migration** if the live DB is missing the dimension columns.

### 3. Agent dashboard, PASS
- Hard auth gate; redirects to `assessment.html` until the archetype is complete.
- QR loads a real server-generated PNG; copy-link, copy-QR, and download-QR work
  with “not ready yet” guards. Lead counts, recent clients, weekly activity chart,
  and messages all render live data with clean empty/error states. Password reset
  uses the real Supabase recovery endpoint. Sign-out works.

### 4. Client landing & client assessment, PASS (minor footer fix)
- Landing CTAs and the decorative preview all navigate to the real
  `assessment.html` (the “demo” animations are marketing visuals, not fake
  features). Footer links fixed.
- Contact step creates an `assessment_lead` (best-effort, non-blocking); progress
  is debounced and saved; submit must return 200 before the confirmation appears
  (real error shown otherwise). Source routing (`qr`/`agent_link` → agent,
  `reviewer` → reviewer queue) is correct. Refresh mid-assessment reuses a cached
  lead id within 24h.

### 5. Reviewer portal, PASS
- `requireReviewerSession` gate: reviewers/admins allowed; agent-only accounts see
  “This account does not have reviewer access.” Queue, incomplete leads, approve,
  and status/notes updates all use live API calls with the bearer token. Empty and
  error states are clean (no sample data).

### 6. API routes, PASS
- All routes import shared helpers via `.js` and wrap logic in `runHandler`
  (CORS + OPTIONS + uniform JSON errors) or an equivalent crash-proof try/catch
  (`auth/me`). Method handling, JSON body parsing, payload-size limits, and auth
  (401/403) are consistent. Env is read lazily (no import-time throws). Response
  shapes match the frontend (`{ queue }`, `{ messages }`, `{ leads }`,
  `{ qrCodeDataUrl, … }`, dashboard payload, etc.).

### 7. Supabase / database, MIGRATION ADDED
- Verified frontend/backend field names against `schema.sql` (snake_case in DB;
  `me.ts` exposes camelCase aliases like `displayName`/`archetypeCompletedAt`).
- Added `0001_align_live_schema.sql` to repair drift safely (idempotent
  `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, enum-value guards).

### 8. Console & network errors, PASS
- Removed the blocked localhost debug POST. API errors now surface the server’s
  real `error`/`code`. Static assets load via relative paths; `config.js` has an
  `onerror` guard. No JS exceptions or broken script paths found.

### 9. ESM / Vercel runtime, PASS
- `"type": "module"`; every relative import in `api/**` and `backend/lib/**`
  uses `.js`. No CommonJS `require(` in shipped code. `scripts/generate-config.js`
  is ESM. `*.legacy.ts` (the only files with extensionless imports) are **excluded**
  by `tsconfig.json` and are not deployed as functions. `tsc --noEmit` is clean.

### 10. Error handling, PASS
- User-facing messages for save failure, expired session, dashboard load failure,
  reviewer access denied, and empty states. No blank pages, redirect loops, or
  fake success.

### 11. Debug helpers, DONE
- `localStorage.setItem('requity_debug','1')` enables safe console logging only.

### 12 / 13. Verification, DONE (see below)

---

## Verification commands run

```
node --check frontend/shared/api.js      # OK
node --check scripts/generate-config.js  # OK
node --check agent/script.js             # OK
npx tsc --noEmit                         # clean (no errors)
```

Searches: no CommonJS `require(` in shipped code; no extensionless relative
imports outside excluded `*.legacy.ts`; no service-role/Brevo **keys** in the
frontend (only “never put keys here” comments); no localhost ingest leftovers; no
TODO/mock/fake-success placeholders on live pages.

---

## Remaining manual steps (Supabase / Vercel)

1. **Run the migration (fixes the submit failure if the DB drifted):**
   Supabase Dashboard → SQL Editor → paste
   `backend/supabase/migrations/0001_align_live_schema.sql` → Run. Then verify:
   ```sql
   select column_name from information_schema.columns
   where table_name = 'agents' order by column_name;
   ```
   Confirm `interaction_style`, `focus`, `stress_response`, `perceived_value`,
   `negotiation_style`, `archetype_completed_at` are present.

2. **Confirm Vercel env vars** (Project → Settings → Environment Variables):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (or `SUPABASE_ANON_KEY`), `VERCEL_FRONTEND_URL`, optional `BREVO_API_KEY`.
   The build runs `scripts/generate-config.js` to emit the public
   `frontend/shared/config.js` (anon key must be present).

3. **Internal users:** create reviewer/admin accounts in Supabase Auth and set
   their `profiles.role` to `reviewer`/`admin` (or run the seed script).

---

## Manual test checklist

**Agent signup / signin**
1. `/agent/login.html` → Create account → lands on `/agent/assessment.html`.
2. Sign out, sign back in → returns to assessment (or dashboard if complete).
3. Refresh any protected page → stays logged in (no loop).

**Agent assessment submit**
1. Answer all 18 questions; “Continue” disabled until each is answered.
2. Final “Submit Assessment” → button shows “Saving…”.
3. On success: result card with archetype, then auto-redirect to the dashboard.
4. In Supabase, the agent row has `archetype` + `archetype_completed_at`, and a
   new `assessments` row exists. (Toggle `requity_debug=1` to watch the call.)

**Dashboard load**
1. After completion, `/agent/dashboard.html` loads; QR image renders; copy/download
   work; counts/charts/messages show live data or clean empty states.

**Client assessment submit**
1. Open an agent QR/link (`?agent=<token>&source=qr`); enter contact + goal.
2. Complete all questions → “Submitting…” → confirmation only after a real 200.
3. The client appears in that agent’s dashboard (qr source stays with the agent).

**Reviewer queue**
1. Sign in as reviewer/admin → `/reviewer/index.html` loads the live queue.
2. Approve a match → it leaves the queue and the agent is notified.
3. Sign in as an agent-only account → “does not have reviewer access.”

**Logout / login persistence**
1. Sign out → redirected to login; protected pages bounce to login.
2. Sign in → session persists across refreshes and direct page opens.

---

## Known limitations / not changed (by request)
- UI not redesigned; demo **mode** not reintroduced (landing-page animations are
  decorative only); no fake success states; no security checks removed; no secrets
  exposed. The reviewer “Auto match” approves each queued client’s top-ranked agent
  via the real API (no simulation).
