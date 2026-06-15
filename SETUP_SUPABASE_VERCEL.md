# REQUITY — Supabase + Vercel Setup (beginner friendly)

This guide takes you from nothing to a live REQUITY deployment. No prior Supabase
or Vercel experience required. Follow the steps in order.

Related docs:
- `DEPLOYMENT_CHECKLIST.md` — the verification checklist (use after this guide).
- `FIRST_LIVE_TEST.md` — a click-by-click first end-to-end test.
- `backend/SEED_REVIEWER_ADMIN.md` — how to make the first reviewer/admin.

---

## Part A — Create the Supabase project

### 1. Create the project
1. Go to https://supabase.com → sign in → **New project**.
2. Pick an organization, name it `requity`, set a strong database password
   (save it somewhere safe), choose a region close to your users → **Create**.
3. Wait ~2 minutes for it to finish provisioning.

### 2. Get your Supabase URL + keys
1. In the project, open **Settings → API**.
2. Copy these three values (you'll paste them into Vercel later):
   - **Project URL** → this is `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`.
   - **Project API keys → `anon` `public`** → this is `SUPABASE_ANON_KEY` and
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`. (Safe to expose to the browser.)
   - **Project API keys → `service_role` `secret`** → this is
     `SUPABASE_SERVICE_ROLE_KEY`. **Keep this secret. Server-side only.**

> The `service_role` key bypasses all security rules. Never put it in the
> frontend, in `config.js`, or in any `NEXT_PUBLIC_*` variable.

### 3. Enable Email Auth
1. Open **Authentication → Providers → Email**.
2. Make sure **Email** is enabled.
3. For the smoothest first run, you may turn **"Confirm email" OFF** (otherwise
   new agents must click a confirmation link before they can sign in). You can
   turn it back on later.

### 4. Run the database schema
1. Open **SQL Editor → New query**.
2. Open `backend/supabase/schema.sql` from this repo, copy ALL of it, paste it in.
3. Click **Run**.
4. You should see "Success". This creates the tables, indexes, the
   `set_updated_at` trigger, the `public.requity_role()` helper, and enables Row
   Level Security with production policies.

> The script is written for a **fresh** project and is safe to re-run on the same
> project (it won't duplicate policies/triggers/indexes). If you ran an older
> version before, re-running will NOT add new columns — start a fresh project or
> apply the missing columns manually. See the header comment in the SQL file.

---

## Part B — Deploy to Vercel

### 5. Create the Vercel project
1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Go to https://vercel.com → **Add New… → Project** → import your repo.
3. Framework preset: **Other** (this is a static frontend + `/api` functions).
4. Leave build settings as default. Click **Deploy** once to create the project
   (it's fine if the first deploy has no env vars yet — you add them next).

### 6. Add environment variables
In Vercel → your project → **Settings → Environment Variables**, add the
following (see `.env.example` for the full list). Set them for **Production**
(and Preview if you want previews to work):

**Server-side only (secrets):**
| Key | Value |
| --- | --- |
| `SUPABASE_URL` | your Project URL |
| `SUPABASE_ANON_KEY` | your anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role secret key |
| `VERCEL_FRONTEND_URL` | your deployed URL, e.g. `https://requity.vercel.app` |
| `BREVO_API_KEY` | *(optional)* Brevo key — omit to run email in test mode |
| `BREVO_SENDER_EMAIL` | *(optional)* a verified Brevo sender |
| `BREVO_SENDER_NAME` | *(optional)* e.g. `REQUITY` |

**Public (safe for the browser):**
| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | same as Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as anon key |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` |

### 7. Configure the frontend
The static pages read `window.REQUITY_CONFIG` from `frontend/shared/config.js`.
Create that file (it is gitignored) by copying `frontend/shared/config.example.js`
and filling in the **public** values only:

```js
window.REQUITY_CONFIG = {
  apiBaseUrl: "/api",
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY",
  frontendUrl: "https://YOUR-APP.vercel.app",
};
```

> Real Supabase credentials are required. Agent and reviewer dashboards need a
> Supabase Auth session; there is no demo mode. If `config.js` is missing or
> blank, treat the setup as incomplete and verify it with the health endpoints.

> `config.js` only ever holds PUBLIC values. The service role key never goes here.

### 8. Deploy
Trigger a new deploy (Vercel → Deployments → **Redeploy**, or push a commit).

### 9. Verify with health checks
Open these URLs (replace the host with your deployment):
- `https://YOUR-APP.vercel.app/api/health` → expect `ok: true` and the
  `hasSupabase*` / `hasBrevoApiKey` booleans reflecting your env vars.
- `https://YOUR-APP.vercel.app/api/health/supabase` → expect
  `ok: true, profilesReachable: true`. If `ok:false`, re-check the service role
  key and that you ran the schema.
- `https://YOUR-APP.vercel.app/api/health/brevo` → `configured:true` when a key
  is set, otherwise `testMode:true` (still `ok:true`).

---

## Part C — First accounts and tests

> **Portals:** agents use **`/agent/login.html`**, reviewers/admins use
> **`/reviewer/login.html`**. Agent accounts cannot access the reviewer dashboard;
> each login page offers a one-click switch if you sign in with the other role.

> **Product wording reference** (visible copy):
> - Agent offer: **$50 setup fee** and **25% per closed REQUITY deal**; agent CTA
>   reads "Start getting referrals now".
> - Client landing headline: "Find the perfect agent for you!"
> - Client assessment header: "We need to learn a little more about you".
> - The root URL (`/`) redirects to `/client/index.html`.

### 10. Create the first agent account
1. Open `https://YOUR-APP.vercel.app/agent/login.html`.
2. **Create account** with full name + email + password.
3. You're redirected to the agent dashboard. Behind the scenes this created a
   `profiles` row (`role=agent`) and an `agents` row.

### 11. Promote a reviewer / admin
There is no public reviewer signup. Promote an existing account:
1. Have the reviewer sign up once (Step 10) with their email.
2. Supabase → **SQL Editor** → run (replace the email):
   ```sql
   update public.profiles set role = 'reviewer' -- or 'admin'
   where email = 'reviewer@yourcompany.com';
   ```
3. Verify: `select email, role from public.profiles where role in ('reviewer','admin');`

Full details: `backend/SEED_REVIEWER_ADMIN.md`.

### 12. Test the QR / agent-link client flow
1. On the agent dashboard, copy the **client assessment link** (or QR link).
2. Open it in a private window, complete the assessment.
3. The client appears in the agent's **Client Assessments** (stays with the
   agent — QR clients are not routed to the reviewer queue).

### 13. Test the reviewer flow
1. Sign in at `reviewer/login.html` (the reviewer portal) with the reviewer/admin
   account.
2. You're routed to `reviewer/index.html`. Confirm the reviewer queue and the
   **Incomplete Assessments** section load. (An `agent` account is rejected here.)
3. Approve a match — the agent receives the "REQUITY Client Match" badge +
   notification.

### 14. Test the incomplete assessment lead flow
1. Open a client assessment link in a private window.
2. Enter contact info, start the assessment, answer a question or two, then
   **close the tab** without finishing.
3. As a reviewer, open `reviewer/index.html` → **Incomplete Assessments**. The
   lead should appear with status `started`/`in_progress`.

### 15. Test Brevo (test mode vs live)
- **Test mode (no key):** `/api/health/brevo` shows `testMode:true`. Email is
  logged in the function logs, not sent. All flows still succeed.
- **Live mode:** set `BREVO_API_KEY` + a verified `BREVO_SENDER_EMAIL`, redeploy,
  approve a match, then check Supabase `email_events` for a `status=sent` row.

---

## Which env vars still need REAL values
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (from Part A.2)
- `VERCEL_FRONTEND_URL` (your deployed URL)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL`
- `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` only if you want live email (optional)
