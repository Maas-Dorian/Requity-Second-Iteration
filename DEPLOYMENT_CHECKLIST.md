# REQUITY Deployment Checklist

Production hardening + Vercel deployment guide for the secure API layer.

> New here? Follow `SETUP_SUPABASE_VERCEL.md` first (step-by-step Supabase +
> Vercel setup), then run `FIRST_LIVE_TEST.md` for a click-by-click smoke test.
> This file is the condensed verification checklist.

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

### Server-side only (NEVER exposed to the browser)
| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Used only by `/api` routes. Bypasses RLS. |
| `SUPABASE_ANON_KEY` | Anon key (server can use it too) |
| `BREVO_API_KEY` | Brevo transactional key. If missing → email runs in test mode |
| `BREVO_SENDER_EMAIL` | Verified Brevo sender |
| `BREVO_SENDER_NAME` | Display name for outbound email |
| `VERCEL_FRONTEND_URL` | Used for CORS origin + building share links |
| `NODE_ENV` | Vercel sets `production` automatically. Auth is always required (no demo mode). |

### Public (safe for the browser)
| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public project URL — **required for browser auth** (sign in/up) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS-gated) — **required for browser auth** |

> The frontend should set `apiBaseUrl` (e.g. `/api`) in `frontend/shared/config.js`
> or `window.REQUITY_CONFIG`. When set, all **data** traffic goes through the secure
> API routes. The browser still uses `supabaseUrl` + `supabaseAnonKey` directly for
> **Supabase Auth** (sign in/up), and attaches the resulting `Authorization: Bearer`
> token to protected `/api` calls.

---

## 2. Supabase setup

1. Create the project and grab URL + keys.
2. Run the schema migration:
   - Supabase SQL Editor → paste `backend/supabase/schema.sql` → Run.
   - This creates tables, indexes, the `set_updated_at` trigger, the
     `public.requity_role()` helper, and enables **RLS with production policies**.
3. Create at least one `reviewer` / `admin` profile so the reviewer queue is
   reachable (set `profiles.role`).

### RLS checklist (verify after migration)
- [ ] RLS is **enabled** on: `profiles`, `agents`, `clients`, `assessments`,
      `match_recommendations`, `messages`, `email_events`, `assessment_leads`.
- [ ] `profiles`: a user can read/update only their own row.
- [ ] `agents`: own row read/update; reviewers/admins can read all.
- [ ] `clients`: agent reads only assigned clients; reviewers/admins read all.
- [ ] `assessments`: owning agent + reviewers/admins can read.
- [ ] `match_recommendations`: recommended agent + reviewers/admins can read.
- [ ] `messages`: agent reads only their own notifications.
- [ ] `email_events`: admins only.
- [ ] `assessment_leads`: reviewers/admins read all; agents read only their own
      qr/agent_link leads; only reviewers/admins update notes/status.
- [ ] No INSERT/UPDATE/DELETE policy exists for anon/authenticated (writes are
      deny-by-default; only the service role writes).
- [ ] Anon browser sessions **cannot** insert into any table.

---

## 2b. Authentication & roles (Supabase Auth)

Agents, reviewers, and admins are real Supabase Auth users. Each auth user maps
to a `profiles` row (`role` = `agent` | `reviewer` | `admin`); agents also get an
`agents` row.

**Portals (entry points):**
- Agent portal: **`/agent/login.html`** (sign in / create account).
- Reviewer portal: **`/reviewer/login.html`** (sign in only — no public sign-up).
- Role-aware redirects: agents → `agent/dashboard.html`; reviewers/admins →
  `reviewer/index.html`. **Agent accounts cannot access the reviewer dashboard.**
  Each login page detects a mismatched role and offers a one-click switch to the
  correct portal instead of failing silently.

1. In Supabase → Authentication → Providers, enable **Email** sign-in.
   - For the smoothest first run you may disable "Confirm email" (otherwise new
     agents must confirm before they can sign in).
2. Frontend auth needs `supabaseUrl` + `supabaseAnonKey` in
   `frontend/shared/config.js` **even when `apiBaseUrl` is set**, because the
   browser talks to Supabase Auth directly. Real Supabase credentials are
   required — there is no demo mode.
3. Agent flow (self-serve): the agent landing CTA "Start getting referrals now"
   links to `agent/login.html` → "Create account" (full name, email, password,
   optional phone only) → `signUpAgent()` creates the auth user, then
   `POST /api/auth/bootstrap-agent` creates the profile (`role='agent'`) + agent
   row. New agents are routed to `agent/assessment.html` first; once the archetype
   is complete they go to `agent/dashboard.html`. The assessment starts directly
   with the questions (no duplicate name/email/DOB/phone step) and saves the
   archetype to the agent row via `POST /api/agent-assessment/submit`. Reviewer-only
   accounts are offered the reviewer portal.
4. Reviewer portal: reviewers/admins sign in at **`/reviewer/login.html`** (a
   dedicated sign-in screen — no public sign-up). Only `reviewer`/`admin` roles
   can open `reviewer/index.html`; everyone else is redirected to
   `reviewer/login.html` (or shown an access-restricted screen for wrong roles).
   The first reviewer/admin must be **promoted in Supabase** after creating an
   account (see below).

### Create the first reviewer / admin
There is no public reviewer sign-up. Promote an existing auth user:

1. Have the person sign up once at `agent/login.html` (creates their auth user +
   an `agent` profile), **or** create the user in Supabase → Authentication → Users.
2. Supabase → SQL Editor → run (replace the email):

```sql
update public.profiles
set role = 'reviewer' -- or 'admin'
where email = 'reviewer@yourcompany.com';
```

3. If the profile row does not exist yet (user created directly in the Auth UI
   and never bootstrapped), insert it:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, coalesce(raw_user_meta_data->>'full_name', email), 'admin'
from auth.users
where email = 'admin@yourcompany.com'
on conflict (id) do update set role = excluded.role;
```

4. Verify: `select email, role from public.profiles where role in ('reviewer','admin');`

> See `backend/SEED_REVIEWER_ADMIN.md` for the full step-by-step. Never expose the
> service role key to do this — use the Supabase SQL editor.

### Seed the internal REQUITY team (admins with agent rows)
The standing internal accounts must reach **both** the agent dashboard and the
reviewer portal:

- Accounts: `rocco@requityapp.com`, `tussa@requityapp.com`, `mike@requityapp.com`
- Role: `admin`, each with an `agents` row (so they pass agent + reviewer checks).
- Initial password: `requityslaunch26` — **change after first login**.
- Run `npm run seed:internal-users` (service-role env vars required) **or** follow
  the SQL in `backend/SEED_INTERNAL_USERS.md`. The script is idempotent. The
  service role key stays server-side only; never hardcode these credentials in
  frontend code.

---

## 3. Brevo setup
- [ ] Verify a sender domain/email in Brevo.
- [ ] Set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`.
- [ ] Confirm: with no key, submission still succeeds (email test mode, no throw).

---

### Client submission rule (`POST /api/client-assessment/submit`)
A submission is valid if it includes **either** an `assessmentToken`/`token`
**or** an `agentToken`/`agentId`:
- `source = qr` / `agent_link` → require `agentToken` or `agentId`; attach the
  client directly to that agent; **no** reviewer queue item.
- `source = reviewer` → require `assessmentToken`/`token`; create a reviewer
  queue item.
- Neither present → reject with **400** and a clear error.

## 4. Test checklist (run against the deployed preview)

### Content & wording (visible copy)
- [ ] Root `/` redirects to `/client/index.html`.
- [ ] Agent landing (`/agent/index.html`) shows the offer **$50 setup fee** and
      **25% per closed REQUITY deal**, with the CTA "Start getting referrals now".
- [ ] Client landing (`/client/index.html`) headline reads
      "Find the perfect agent for you!".
- [ ] Client assessment (`/client/assessment.html`) header reads
      "We need to learn a little more about you".

### Health endpoints (no auth required)
- [ ] **`GET /api/health`** → `ok:true`, `environment` correct, and presence
      booleans (`hasSupabaseUrl`, `hasSupabaseServiceRoleKey`, `hasBrevoApiKey`,
      `hasFrontendUrl`) match your configured env. No secret values are returned.
- [ ] **`GET /api/health/supabase`** → `ok:true`, `profilesReachable:true`.
- [ ] **`GET /api/health/auth-config`** → `hasSupabaseUrl`, `hasSupabaseAnonKey`,
      `hasSupabaseServiceRoleKey`, and `canReachSupabase` all `true` (booleans only,
      no secrets). If `hasSupabaseServiceRoleKey:false`, sign-in works but
      `/api/auth/me` returns `code:"MISSING_SUPABASE_SERVICE_ROLE_KEY"`.
      `ok:false` means the service role key is wrong or `schema.sql` wasn't run.
- [ ] **`GET /api/health/brevo`** → `configured:true` (live) or `testMode:true`
      with `ok:true` when no key is set.

### Auth
- [ ] **Agent sign-up** — create an account at `agent/login.html`; a `profiles`
      row (`role=agent`) and an `agents` row are created; redirected to the dashboard.
- [ ] **Agent sign-in** — signing in routes an agent to `agent/dashboard.html`.
- [ ] **Dashboard loads own data** — `GET /api/auth/me` returns the agent;
      dashboard data uses that `agent.id` (no hardcoded id).
- [ ] **Reviewer login** — `reviewer/login.html` loads; a reviewer/admin sign-in
      redirects to `reviewer/index.html`; an `agent` sees "This account does not
      have reviewer access." with a button to the Agent Dashboard.
- [ ] **Agent login role switch** — a reviewer/admin signing in at
      `agent/login.html` sees "This account has reviewer access." with a button to
      the Reviewer Portal (instead of landing in the agent dashboard).
- [ ] **Cross-portal links** — the agent landing shows a discreet "Reviewer
      Portal" link; the reviewer login shows an "Agent Portal" link.
- [ ] **Unauthenticated reviewer redirect** — opening `reviewer/index.html` with
      no session redirects to `reviewer/login.html` (no demo bypass).
- [ ] **Unauthenticated agent redirect** — opening `agent/dashboard.html` with no
      session redirects to `agent/login.html` (no demo bypass).
- [ ] **Root URL** — opening `/` redirects to `/client/index.html`.
- [ ] **Agent cannot access reviewer** — an `agent` opening `reviewer/index.html`
      sees the "Access restricted" screen and no reviewer data loads.
- [ ] **Reviewer/admin promotion** — after running the `update public.profiles
      set role='reviewer'…` snippet, `GET /api/auth/me` for that user returns
      `role: "reviewer"` and they can open the reviewer dashboard.
- [ ] **Reviewer/admin access** — a `reviewer`/`admin` can open `reviewer/index.html`
      and load `GET /api/reviewer/assessment-leads` and `/api/reviewer/matches`.
- [ ] **Unauthenticated rejection** — with `NODE_ENV=production` and no token,
      `GET /api/auth/me`, `/api/dashboard/agent`, and `/api/reviewer/*` return 401.

### Assessments & matching
- [ ] **Client QR submission** — `source=qr` with `agentToken`/`agentId`
      attaches the client to the agent; no reviewer queue entry; agent gets a
      completion notification + email.
- [ ] **Client agent_link submission** — `source=agent_link` with
      `agentToken`/`agentId` behaves the same as QR.
- [ ] **Client reviewer submission** — `source=reviewer` with
      `assessmentToken`/`token` places the client in the reviewer queue.
- [ ] **Invalid submission** — no token and no agent reference → `400`.
- [ ] **Agent assessment submission** — `POST /api/agent-assessment/submit`
      computes + saves the archetype and creates a notification.
- [ ] **Dashboard load** — `GET /api/dashboard/agent` requires agent auth;
      rejects with 401 when no token in production.
- [ ] **Assessment activity analytics** — the dashboard "Assessment activity"
      chart shows **real** last-7-days counts from `assessment_leads` (embedded as
      `weeklyActivity` in `GET /api/dashboard/agent`; also at
      `GET /api/dashboard/agent-activity`, `days` default 7 / max 30). Start +
      complete a client assessment, then confirm the bars/caption update. With no
      data it shows seven zero days + "No assessment activity yet."; if analytics
      fails the chart shows "Assessment activity could not be loaded." while the
      rest of the dashboard still loads. No polling / no real-time subscriptions.
- [ ] **Agent QR code** — `GET /api/agent/qr` requires agent auth. The QR encodes
      the agent's public assessment link (`source=qr`), so scanning clients attach
      directly to the agent and do **not** enter the reviewer queue. `format=dataUrl`
      returns `{ qrCodeDataUrl, assessmentLink, qrLink }`; `format=png` returns a PNG
      download. QR generation is Vercel-safe (`qrcode` only — no `canvas`/`sharp`).
- [ ] **Messages load** — `GET /api/messages/list` requires agent auth, and the
      agent dashboard **Messages** tab renders the agent's notifications (e.g. the
      REQUITY Client Match message after a reviewer approval).
- [ ] **Reviewer approve match** — `POST /api/reviewer/approve-match` requires
      reviewer/admin auth; assigns client (REQUITY Client Match badge), creates
      the exact notification, sends + records the Brevo email.
- [ ] **Incomplete lead capture** — starting an assessment creates an
      `assessment_leads` row (`POST /api/assessment-leads/start`); answering
      questions updates it (`/progress`); completing the assessment converts it to
      `completed`. Abandoned leads stay incomplete.
- [ ] **Reviewer incomplete leads** — `GET /api/reviewer/assessment-leads`
      requires reviewer/admin auth; the reviewer "Incomplete Assessments" section
      lists not-completed leads first; Mark Followed Up / Abandoned / Add Note work.
- [ ] **Brevo email send** — confirm an `email_events` row with `status=sent`.
- [ ] **Rate limiting** — rapid repeated public submissions return `429`.
- [ ] **No demo mode** — there is no demo bypass anywhere. Protected routes reject
      missing/invalid auth with 401 and wrong-role with 403; dashboards require a
      real Supabase session; failed data loads show an error/empty state (never
      sample data).

---

## 5. Security decisions (summary)
- Service role key is server-side only; the browser uses `apiBaseUrl` routes.
- RLS is deny-by-default for writes; the service role performs all mutations.
- Auth via `Authorization: Bearer <access_token>` verified against Supabase Auth.
- Public submission routes are validated (email/date/phone), size-capped, and
  rate limited (best-effort in-memory; swap for Upstash Redis in production).
- Logs avoid PII (phone masked, DOB dropped, email masked).

## 6. Still needs real credentials
- Supabase project (URL + anon + service role keys) and the SQL migration.
- Brevo API key + verified sender for live email.
- Production rate limiting backend (Upstash Redis or Supabase-backed) to replace
  the in-memory placeholder in `backend/lib/rateLimit.ts`.
