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

## 1. Deploy is live
- [ ] `https://YOUR-APP/agent/index.html` loads the marketing page (with a
      discreet "Reviewer Portal" link in the header).

## 2. Open agent login
- [ ] Click **Sign in / Sign up** (or open `https://YOUR-APP/agent/login.html`).

## 3. Create an agent
- [ ] Choose **Create account**. Enter full name, email, password (+ optional
      phone/brokerage/license) → submit.
- [ ] You land on `agent/dashboard.html`. (If email confirmation is ON, confirm
      via email first, then sign in.)
- [ ] In Supabase → Table editor → `profiles`: a row exists with `role = agent`.
      In `agents`: a matching row exists with a `public_assessment_token`.

## 4. Complete the agent assessment
- [ ] From the dashboard, click **Discover your Agent Archetype** (or open
      `agent/assessment.html`). Answer all questions and submit.
- [ ] The final screen confirms the archetype (no "retake" CTA). In Supabase
      `agents`, your row now has an `archetype`.

## 5. Copy the agent QR / public link
- [ ] On the dashboard, copy the **client assessment link** and the **QR link**.
      They contain `?agent=<public_token>&source=agent_link` (or `source=qr`).

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

---

### If something fails
- 401 on dashboard/reviewer calls → not signed in, or token missing. Re-sign in.
- `/api/health/supabase` `ok:false` → check `SUPABASE_SERVICE_ROLE_KEY` and that
  `schema.sql` ran on THIS project.
- Reviewer page shows Access restricted for a reviewer → confirm the profile role
  is `reviewer`/`admin` (step 11) and re-sign in.
- No email sent → expected in test mode (`BREVO_API_KEY` unset). Set the key +
  verified sender to go live.
