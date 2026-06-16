# REQUITY — First Live Test (click-by-click)

A manual end-to-end smoke test to run once after your first real deployment.
Assumes you've completed `SETUP_SUPABASE_VERCEL.md` (Supabase schema applied,
Vercel env vars set, `config.js` configured with public values).

Replace `YOUR-APP` with your Vercel host (e.g. `requity.vercel.app`) throughout.

> Tip: do the agent steps in your normal browser and the client steps in an
> incognito/private window so sessions don't collide.

---

## 0. Pre-flight: health checks
- [ ] Open `https://YOUR-APP/api/health` → `ok: true`, and the booleans
      (`hasSupabaseUrl`, `hasSupabaseServiceRoleKey`, `hasBrevoApiKey`, …) match
      what you configured.
- [ ] Open `https://YOUR-APP/api/health/supabase` → `ok: true`,
      `profilesReachable: true`.
- [ ] Open `https://YOUR-APP/api/health/brevo` → `configured` true (live) or
      `testMode: true` (no key). Either is fine.

> **Portals:** agents → `/agent/login.html`, reviewers/admins → `/reviewer/login.html`.
> Agent accounts cannot access the reviewer dashboard; each login offers a
> one-click switch to the correct portal on a role mismatch.

> **Product wording reference** (visible copy you should see):
> - Agent landing: "Become a REQUITY agent. Start getting referrals today." with
>   the offer "Low $50 setup fee. Only 25% per closed deal." and CTA
>   "Start getting referrals now".
> - Client landing headline: "Find the perfect agent for you!"
> - Client assessment header: "We need to learn a little more about you".

## 1. Deploy is live
- [ ] `https://YOUR-APP/` redirects to `/client/index.html`.
- [ ] `https://YOUR-APP/client/index.html` shows "Find the perfect agent for you!".
- [ ] `https://YOUR-APP/agent/index.html` loads the marketing page showing the
      "$50 setup fee / 25% per closed deal" offer and the "Start getting referrals
      now" button (with a discreet "Reviewer Portal" link in the header).

## 2. Open agent login
- [ ] Click **Start getting referrals now** (it links to `agent/login.html`).
      There is no separate "Sign in / Sign up" button in the header anymore.

## 3. Create an agent
- [ ] Choose **Create account**. Enter **only** full name, email, password
      (+ optional phone) → submit.
- [ ] You are routed to `agent/assessment.html` (not the dashboard) because the
      archetype is not complete yet. (If email confirmation is ON, confirm via
      email first, then sign in — you'll land on the assessment.)
- [ ] In Supabase → Table editor → `profiles`: a row exists with `role = agent`.
      In `agents`: a matching row exists with a `public_assessment_token`.

## 4. Complete the agent assessment
- [ ] The assessment starts **directly with the questions** — it does NOT ask for
      your name, email, date of birth, or phone again (no duplicate contact step).
      Unauthenticated visitors who open `agent/assessment.html` are redirected to
      `agent/login.html`.
- [ ] Answer all questions and submit. On success you see "Your agent profile is
      ready" with a **Go to your dashboard** button. In Supabase `agents`, your
      row now has an `archetype` and `archetype_completed_at`.
- [ ] Re-opening `agent/dashboard.html` now loads normally; before completion it
      redirects back to the assessment.

## 5. Copy the agent QR / public link
- [ ] On the dashboard, copy the **client assessment link** and the **QR link**.
      They contain `?agent=<public_token>&source=agent_link` (or `source=qr`).
- [ ] In the **QR code** card, a real QR image renders (REQUITY orange on white,
      served by `GET /api/agent/qr`). **Download** saves `requity-assessment-qr.png`
      and **Copy** copies the QR link. The QR encodes the `source=qr` link, so
      clients who scan it attach directly to you and never go to the reviewer queue.
      (QR generation is Vercel-safe — `qrcode` only, no `canvas`/`sharp`.)

## 6. Open the client link in incognito
- [ ] Paste the agent link into a private window. The client assessment intro loads.

## 7. Enter contact info, then abandon
- [ ] Enter name, email, phone and **start** the assessment.
- [ ] Answer 1–2 questions, then **close the tab** (do not finish).

## 8. Verify the incomplete lead appears
- [ ] Sign in as a reviewer/admin (see step 11) and open `reviewer/index.html` →
      **Incomplete Assessments**. The lead shows name/email/phone, source badge,
      status `started`/`in_progress`, started + last-activity times, answered
      count, and the assigned agent.

## 9. Finish another client assessment
- [ ] Open the agent link again in a fresh private window. This time complete the
      whole assessment and submit.
- [ ] The lead for that session flips to `completed` (Incomplete Assessments list
      filters can confirm).

## 10. Verify the client appears on the agent dashboard
- [ ] Back in the agent dashboard → **Client Assessments**: the completed client
      appears with their archetype. (QR/agent-link clients stay with the agent —
      not routed to the reviewer queue.)
- [ ] **Assessment activity chart** (dashboard overview) now reflects real data:
      the day you started the assessment shows a non-zero **started** bar, and the
      caption reads e.g. "Last 7 days: 1 started · 1 completed." This is a real
      last-7-days count from `assessment_leads` (embedded as `weeklyActivity` in
      `GET /api/dashboard/agent`; no polling/subscriptions). Before any activity
      it shows seven zero days and "No assessment activity yet."; the rest of the
      dashboard still loads even if the chart can't.

## 11. Promote a reviewer / admin
- [ ] Sign up a second account (step 3) with the reviewer email.
- [ ] Supabase → SQL Editor:
      ```sql
      update public.profiles set role = 'reviewer' where email = 'reviewer@yourcompany.com';
      ```
- [ ] Sign in at `reviewer/login.html` (the reviewer portal) with that account →
      you're routed to `reviewer/index.html`. An `agent` account is rejected with
      "This account does not have reviewer access," and opening the dashboard
      directly with no session redirects to `reviewer/login.html`.

## 12. Approve a reviewer match
- [ ] In the reviewer dashboard, take a reviewer-sourced client and **approve**
      a match to an agent.

## 13. Verify the agent gets the badge + message
- [ ] Open the matched agent's dashboard → **Client Assessments**: the client
      shows the **REQUITY Client Match** badge.
- [ ] **Messages**: the agent has the notification
      "You've received a client match from REQUITY! If you have any issues message
      requity@support.com. Thank you for working with us."
- [ ] If Brevo is live: Supabase `email_events` has a `status = sent` row for the
      reviewer-match email. (In test mode, the email is logged, not sent.)

## 14. Seed + verify the internal REQUITY team
- [ ] Run `npm run seed:internal-users` (with service-role env vars) or use the
      SQL in `backend/SEED_INTERNAL_USERS.md`. This creates `rocco@`, `tussa@`,
      `mike@requityapp.com` as `role = admin` with an `agents` row each.
- [ ] Sign in at `agent/login.html` with an internal account (initial password
      `requityslaunch26`) → routed to the agent assessment first time, dashboard
      after completion.
- [ ] Sign in at `reviewer/login.html` with the same account → routed straight to
      `reviewer/index.html`. A normal `agent` account is still rejected there.
- [ ] Change the initial password after first login (dashboard → Settings →
      **Send password reset**, which sends a real Supabase recovery email).

## 15. Auth persistence (session must survive refresh + navigation)
Sign-in stores one Supabase session in `localStorage` under `requity_session`
(access_token, refresh_token, expires_at, user). Protected pages verify it with
`/api/auth/me` using `Authorization: Bearer <token>` and refresh the token when
it nears expiry.

- [ ] **Agent sign in** → lands on assessment (first time) or dashboard.
- [ ] **Refresh the dashboard** (Cmd/Ctrl+R) → stays signed in, no bounce to login.
- [ ] **Navigate** dashboard → assessment → dashboard → no redirect loop.
- [ ] **Close the tab and reopen** the dashboard URL → still signed in.
- [ ] **Sign out** (sidebar) → dashboard now redirects to `login.html`.
- [ ] **Admin sign in** at agent login → dashboard (after assessment) works.
- [ ] **Open the reviewer portal** (`reviewer/login.html`) with the admin → lands
      on `reviewer/index.html`; refresh keeps you in.
- [ ] **Open the agent dashboard as admin** → works (admins have an agent row).
- [ ] **Wrong-role access**: a plain `agent` opening `reviewer/index.html` sees a
      clean "Access restricted" screen (no loop). A `reviewer`-only account opening
      the agent dashboard is routed to the reviewer portal.
- [ ] **Token refresh**: leave the dashboard open ~1 hour (or set a short JWT
      expiry in Supabase) → the next action refreshes silently, no logout.
- [ ] **Debug logs (optional)**: in the console run
      `localStorage.setItem('requity_auth_debug','1')`, reload, and watch for
      `[auth] …` debug lines (no tokens/secrets are ever printed).

---

### If something fails
- Signed in but bounced back to login on every page → check `/api/auth/me`
  returns 200 with a Bearer token. A 500 there (often a missing
  `SUPABASE_SERVICE_ROLE_KEY` on Vercel) now shows a "couldn't verify your
  account" message instead of looping — fix the env var and retry.
- 401 on dashboard/reviewer calls → not signed in, or token missing. Re-sign in.
- `/api/health/supabase` `ok:false` → check `SUPABASE_SERVICE_ROLE_KEY` and that
  `schema.sql` ran on THIS project.
- Reviewer page shows Access restricted for a reviewer → confirm the profile role
  is `reviewer`/`admin` (step 11) and re-sign in.
- No email sent → expected in test mode (`BREVO_API_KEY` unset). Set the key +
  verified sender to go live.
