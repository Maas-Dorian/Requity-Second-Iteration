# REQUITY API Routes

Secure Vercel serverless functions in `api/`. All routes use the Supabase
**service role key** on the server only (via `backend/lib/supabaseAdmin.ts`); the
key is never sent to the browser. The static frontend always calls these routes
via `apiBaseUrl` (usually `/api`). Real Supabase credentials are required; there
is no demo mode or sample-data fallback.

Conventions:
- JSON in / JSON out. Errors: `{ "error": string }` with a 4xx/5xx status.
- CORS allows `VERCEL_FRONTEND_URL` (or `*`), with `OPTIONS` preflight handled.
- Validation uses small helpers in `api/_lib/http.ts` (no framework).

---

## Authentication

Agents, reviewers, and admins are real Supabase Auth users. The browser signs in
directly against Supabase Auth (`supabaseUrl` + anon key), stores the session, and
sends `Authorization: Bearer <access_token>` on protected `/api` calls. Server
routes verify the token with `getUserFromRequest()` and map it to a profile/role
via `backend/lib/auth.ts`. In non-production, a missing token falls back to a demo
profile; in production a missing/invalid token is rejected.

### POST `/api/auth/bootstrap-agent` (protected)

Creates/updates the caller's profile (`role='agent'`) and agent row. Idempotent —
safe to call after every sign-in. Never downgrades an existing reviewer/admin.

- **Auth:** requires `Authorization: Bearer <access_token>` (401 otherwise).
- **Request body**
  ```json
  { "fullName": "string?", "phone": "string?", "brokerage": "string?", "licenseNumber": "string?", "frontendUrl": "string?" }
  ```
- **Response**
  ```json
  { "profile": {…}, "agent": {…}, "publicToken": "string", "dashboardUrl": "string", "assessmentLink": "string", "qrLink": "string" }
  ```
- **Tables touched:** `profiles` (upsert), `agents` (upsert)

### GET `/api/auth/me` (protected)

Returns the current user, role, profile, and agent row (if `role='agent'`).

- **Auth:** requires bearer token (401 otherwise).
- **Response**
  ```json
  { "user": { "id": "uuid", "email": "string|null" }, "role": "agent|reviewer|admin|null",
    "profile": { "id": "uuid", "email": "string", "role": "string" } | null,
    "agent": { "id": "uuid", "displayName": "string", "email": "string", "publicToken": "string", "archetype": "string|null" } | null,
    "needsBootstrap": true }
  ```
- **Tables touched:** `profiles` (read), `agents` (read)

### POST `/api/auth/logout`

No-op convenience endpoint returning `{ "ok": true }`. Sign-out happens
client-side by clearing the stored session (and a best-effort Supabase logout).

---

## POST `/api/client-assessment/create`

Create a shareable client assessment link/token for an agent (or reviewer flow).

- **Request body**
  ```json
  { "source": "qr | agent_link | reviewer", "agentId": "uuid?", "agentToken": "string?", "frontendUrl": "string?" }
  ```
- **Response**
  ```json
  { "token": "string", "surveyUrl": "string", "source": "qr|agent_link|reviewer", "agentId": "uuid|null" }
  ```
- **Tables touched:** `assessments` (insert draft, mints token), `agents` (read, when resolving `agentToken`)
- **Notification created:** none
- **Brevo email:** no

---

## POST `/api/client-assessment/submit`

Complete a client assessment. Archetype is recomputed server-side from answers.

- **Request body**
  ```json
  {
    "assessmentToken": "string?",
    "token": "string?",
    "source": "qr | agent_link | reviewer",
    "contact": { "fullName": "string", "email": "string?", "phone": "string?", "dateOfBirth": "string?" },
    "answers": { "1": "value", "...": "..." },
    "result": { "archetype": "string", "...": "..." },
    "agentId": "uuid?",
    "agentToken": "string?",
    "leadId": "uuid?"
  }
  ```
  `assessmentToken` is accepted as an alias for `token`. When `leadId` (or a
  matching email+source) is present, the incomplete `assessment_leads` row is
  converted to `completed` server-side.
- **Validation rule (submission is valid if it includes EITHER an
  `assessmentToken`/`token` OR an `agentToken`/`agentId`):**
  - `source = qr` or `agent_link` → **require** `agentToken` or `agentId`. Attach
    the client directly to that agent. Do **not** create a reviewer queue item.
  - `source = reviewer` → **require** `assessmentToken`/`token`. Create a reviewer
    queue item.
  - Neither token nor agent reference present → reject with **400** and a clear error.
  - Also: public route is rate limited and payload size-capped; `email`/`phone`/
    `dateOfBirth` are format-validated/sanitized; `answers` must be a non-empty
    object/array.
- **Response**
  ```json
  { "archetype": "string", "orientation": "string", "style": "string", "stressResponse": "string",
    "clientId": "uuid", "assessmentId": "uuid", "source": "qr|requity_reviewer", "assignedAgentId": "uuid|null",
    "status": "assigned|reviewer_matching", "emailed": false }
  ```
- **Routing:** `qr` / `agent_link` → attach to the agent (`status = assigned`, no reviewer queue). `reviewer` → reviewer queue (`status = reviewer_matching`).
- **Tables touched:** `clients` (insert), `assessments` (insert/update), `agents` (read), `messages` (insert), `email_events` (insert, QR only)
- **Notification created:** `client_assessment_completed`
- **Brevo email:** yes for QR / agent_link clients when `BREVO_API_KEY` is set (recorded in `email_events`)

---

## Incomplete assessment lead capture

If a client enters their contact info and starts the assessment but never
finishes, REQUITY still captures their name/email/phone as a **lead** so
reviewers can follow up. Flow:

1. `POST /api/assessment-leads/start` — creates the lead when the assessment begins.
2. `POST /api/assessment-leads/progress` — updates answered count / partial answers (debounced).
3. Completion — `POST /api/client-assessment/submit` converts the same lead to
   `completed` server-side (or call `POST /api/assessment-leads/complete` directly).
4. Reviewers view leads at `GET /api/reviewer/assessment-leads` and update them at
   `POST /api/reviewer/assessment-leads/update`.

**Privacy note:** contact info is only collected after the user intentionally
provides it on the contact step and starts the assessment.

---

## POST `/api/assessment-leads/start`

Create (or reuse) an incomplete lead. Public, validated, rate limited.

- **Request body**
  ```json
  { "source": "qr | agent_link | reviewer", "fullName": "string", "email": "string?",
    "phone": "string?", "agentId": "uuid?", "agentToken": "string?", "reviewerId": "uuid?", "contactConsent": true }
  ```
  `qr` / `agent_link` require `agentToken` or `agentId`.
- **Response:** `{ "leadId": "uuid", "status": "started|in_progress" }`
- **Dedupe:** by `client_assessment_id` if present, else by recent (24h) `email` +
  `source` + `agent_id`/`reviewer_id`. A completed lead is never reused.
- **Tables touched:** `assessment_leads` (insert/update), `agents` (read for token)
- **Notification created:** none by default (optional reviewer hook, disabled)
- **Brevo email:** no

---

## POST `/api/assessment-leads/progress`

Update lead progress as questions are answered. Public, rate limited (high ceiling).

- **Request body:** `{ "leadId": "uuid", "answeredCount": 0, "partialAnswers": { "1": "value" }, "archetype": "string?" }`
- **Response:** `{ "leadId": "uuid", "status": "in_progress", "answeredCount": 0 }` (no other lead data exposed)
- **Behavior:** merges partial answers, bumps `last_activity_at`; never downgrades a completed lead.
- **Tables touched:** `assessment_leads` (read + update)
- **Notification created:** none
- **Brevo email:** no

---

## POST `/api/assessment-leads/complete`

Mark a lead completed. Public; usually called server-side by submit.

- **Request body:** `{ "leadId": "uuid?", "clientAssessmentId": "uuid?", "email": "string?", "source": "qr|agent_link|reviewer?", "archetype": "string?" }`
  (one of `leadId`, `clientAssessmentId`, or `email`+`source` required)
- **Response:** `{ "leadId": "uuid", "status": "completed" }` or `{ "matched": false }`
- **Tables touched:** `assessment_leads` (read + update)
- **Notification created:** none
- **Brevo email:** no

---

## GET `/api/reviewer/assessment-leads`

List leads for the reviewer dashboard. **Requires reviewer/admin auth.**

- **Query:** `status?`, `source?`, `search?` (name/email/phone), `limit?`
- **Response:** `{ "leads": [ { /* assessment_leads row + agent_name */ } ] }`
- **Order:** not-completed first, newest activity first.
- **Tables touched:** `assessment_leads` (read), `agents` (read for display names)
- **Notification created:** none
- **Brevo email:** no

---

## POST `/api/reviewer/assessment-leads/update`

Update a lead's follow-up status and/or notes. **Requires reviewer/admin auth.**

- **Request body:** `{ "leadId": "uuid", "status": "followed_up|abandoned|...?", "notes": "string?" }`
- **Response:** `{ "lead": { /* updated assessment_leads row */ } }`
- **Tables touched:** `assessment_leads` (update)
- **Notification created:** none
- **Brevo email:** no

---

## POST `/api/agent-assessment/submit`

Save the agent archetype from the agent survey.

- **Request body**
  ```json
  {
    "contact": { "name": "string", "email": "string", "phone": "string?", "dateOfBirth": "string?" },
    "answers": { "1": "A", "...": "..." },
    "agentId": "uuid?",
    "profileId": "uuid?"
  }
  ```
- **Response**
  ```json
  { "archetype": "string", "interactionStyle": "string", "focus": "string", "stressResponse": "string",
    "perceivedValue": "string", "negotiationStyle": "string", "agentId": "uuid", "assessmentId": "uuid" }
  ```
- **Tables touched:** `agents` (insert/update), `assessments` (insert), `messages` (insert)
- **Notification created:** `agent_archetype_completed`
- **Brevo email:** no

---

## GET `/api/dashboard/agent?agentId=...`

Aggregated agent dashboard payload.

- **Query:** `agentId` (required), `frontendUrl` (optional)
- **Response**
  ```json
  {
    "agent": { "id": "uuid", "displayName": "string", "email": "string", "archetype": "string|null" },
    "assessmentLink": "string", "qrLink": "string",
    "assessmentActivity": { "linkOpened": 0, "started": 0, "completed": 0 },
    "weeklyActivity": {
      "days": [ { "date": "YYYY-MM-DD", "label": "Mon", "started": 0, "completed": 0 } ],
      "totalStarted": 0, "totalCompleted": 0
    },
    "clientFlowCounts": { "total": 0, "qr": 0, "reviewer": 0, "assigned": 0, "awaitingReview": 0 },
    "recentClients": [ { "id": "uuid", "name": "string", "archetype": "string|null", "status": "string", "source": "string", "updatedAt": "ts" } ],
    "messages": [ /* NotificationRecord */ ],
    "clientAssessmentDetail": [ /* clients with assessments */ ],
    "settings": { "accountEmail": "string|null", "supabaseConnected": true, "oauth": { "google": "...", "apple": "...", "email": "..." } }
  }
  ```
- `weeklyActivity` powers the "Assessment activity" chart (real last-7-days
  counts from `assessment_leads`). It is `null` if the analytics query fails, so
  the rest of the dashboard still renders and the chart shows a clean error state.
- **Tables touched:** `agents` (read), `clients` + `assessments` (read), `messages` (read), `assessment_leads` (read, analytics)
- **Notification created:** none
- **Brevo email:** no

---

## GET `/api/dashboard/agent-activity` (protected)

Lightweight per-day assessment analytics for the "Assessment activity" chart.
Same data as `weeklyActivity` above, exposed standalone for explicit ranges. The
dashboard itself reads `weeklyActivity` from `/api/dashboard/agent`, so it makes a
single request — this route is for custom/standalone use.

- **Auth:** `requireAgent` (agent or admin). Normal agents only see their own
  analytics; admins may pass `?agentId=` to target a specific agent.
- **Query:** `days` (optional, default `7`, max `30`), `agentId` (admin-only)
- **Response**
  ```json
  {
    "activity": {
      "days": [ { "date": "YYYY-MM-DD", "label": "Mon", "started": 0, "completed": 0 } ],
      "totalStarted": 0,
      "totalCompleted": 0
    }
  }
  ```
- **Source:** counts `assessment_leads.started_at` / `completed_at` for the agent
  within the window (one small, bounded query; missing days filled with zeros).
- **Tables touched:** `assessment_leads` (read)
- **Notification created:** none
- **Brevo email:** no
- **Notes:** no polling, no real-time subscriptions; computed server-side.

---

## GET `/api/agent/qr` (protected)

QR code for the signed-in agent's public assessment link. The QR encodes the
agent's `qr`-source link, so clients who scan it **attach directly to the agent
(source `qr`) and never enter the reviewer queue**. Requires a real agent
session (admins may target an agent via `?agentId=`).

QR generation is **Vercel-safe**: it uses only the pure-JS `qrcode` package
(PNG via `pngjs`). No `canvas`, no `sharp`, no Node native image dependencies.
Only the public link is encoded — the Supabase service-role key is never exposed.

- **Query:** `format` (`dataUrl` default, or `png`), `agentId` (required for admins), `frontendUrl` (optional)
- **Response (`format=dataUrl`)**
  ```json
  { "qrCodeDataUrl": "data:image/png;base64,...", "assessmentLink": "string", "qrLink": "string" }
  ```
- **Response (`format=png`)**: `image/png` buffer (`Content-Disposition: attachment; filename="requity-assessment-qr.png"`)
- **QR style:** REQUITY orange `#ea580c` on white, width `400`, margin `2`, error correction `H`
- **Tables touched:** `agents` (read public token)
- **Notification created:** none
- **Brevo email:** no

---

## GET `/api/messages/list?agentId=...`

List an agent's notifications.

- **Query:** `agentId` (required), `unreadOnly` (optional, `"true"`)
- **Response:** `{ "messages": [ /* NotificationRecord */ ] }`
- **Tables touched:** `messages` (read)
- **Notification created:** none
- **Brevo email:** no

---

## POST `/api/messages/mark-read`

Mark one notification read.

- **Request body:** `{ "messageId": "uuid" }`
- **Response:** `{ "message": { /* NotificationRecord */ } }`
- **Tables touched:** `messages` (update `read_at`)
- **Notification created:** none
- **Brevo email:** no

---

## GET `/api/reviewer/matches`

Pending reviewer-queue clients with ranked recommended agents.

- **Response**
  ```json
  { "queue": [ { "client": { /* client row */ }, "rankings": [ { "agent": {...}, "score": 0, "label": "string", "reason": "string", "agentRow": {...} } ] } ] }
  ```
- **Tables touched:** `clients` (read, `status = reviewer_matching`), `agents` (read)
- **Notification created:** none
- **Brevo email:** no

---

## POST `/api/reviewer/approve-match`

Approve a reviewer match and assign the client to the chosen agent.

- **Request body**
  ```json
  { "clientId": "uuid", "agentId": "uuid", "score": 0, "reason": "string?", "reviewerId": "uuid?" }
  ```
- **Response:** `{ "matchId": "uuid", "clientId": "uuid", "agentId": "uuid", "notified": true, "emailed": true }`
- **Effect:** client assigned to agent (shown with the **REQUITY Client Match** badge), exact reviewer-match notification created.
- **Tables touched:** `match_recommendations` (insert), `clients` (update assign), `agents` (read), `messages` (insert), `email_events` (insert)
- **Notification created:** `reviewer_match_received` — body:
  > You've received a client match from REQUITY! If you have any issues message requity@support.com. Thank you for working with us.
- **Brevo email:** yes (reviewer match email; recorded in `email_events`)
