# REQUITY Implementation — Next Steps

This document explains how the backend foundation, matching, notifications, and
email connect together, and what to configure when deploying to Vercel +
Supabase + Brevo.

## Architecture at a glance

```
frontend (static)            backend/lib (TypeScript)              services
client/ agent/ reviewer/  →  clientAssessments / agentAssessments  → Supabase
frontend/shared/api.js    →  reviewerMatches / matching            → Brevo
                             messages / emailEvents                → email_events
```

The static frontend talks to `frontend/shared/api.js`, which either calls
Supabase REST (or a future `apiBaseUrl`) or falls back to **demo mode** when no
config is present. The TypeScript modules in `backend/lib` are the authoritative,
Supabase-ready service layer to wire into Edge Functions / API routes.

## Supabase tables used

Defined in `backend/supabase/schema.sql`:

| Table | Purpose |
|-------|---------|
| `profiles` | Auth users with a role (`client`/`agent`/`reviewer`/`admin`) |
| `agents` | Agent profile + archetype dimensions + `public_assessment_token` (QR) |
| `clients` | Client profile, `source` (`qr` / `requity_reviewer`), archetype, status |
| `assessments` | Client & agent assessment answers + computed `result` |
| `match_recommendations` | Reviewer queue recommendations (pending → assigned) |
| `messages` | In-app notifications (see notification logic) |
| `email_events` | Audit log of every transactional email attempt |
| `assessment_leads` | Incomplete/partial assessment lead capture for follow-up |

Run `schema.sql` in the Supabase SQL editor before wiring the frontend.

## Where to connect Vercel env vars

Copy `backend/.env.example` and set these in **Vercel → Project → Settings →
Environment Variables**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public; safe in the browser)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to the browser)
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (optional sender overrides)
- `VERCEL_FRONTEND_URL`

For the static frontend, copy `frontend/shared/config.example.js` to
`frontend/shared/config.js` (or inject `window.REQUITY_CONFIG`) with the
**anon** key only. The service role key must stay server-side.

## Where the Brevo API key goes

`BREVO_API_KEY` is read by `backend/lib/brevo.ts` via `backend/lib/env.ts`. If it
is missing, Brevo runs in **test mode** (logs instead of sends) so local/dev
never fails. Every send is recorded in `email_events` through
`backend/lib/emailEvents.ts`.

## Where matching logic lives

`backend/lib/matching.ts` — the archetype maps and the weighted score:

- 30% orientation fit, 25% style/focus fit, 25% stress-response fit,
  10% negotiation fit, 10% perceived-value fit.

Helpers: `calculateAgentClientMatch`, `rankAgentsForClient`,
`primaryMatchPercentages`. The reviewer queue uses these via
`backend/lib/reviewerMatches.ts` (`rankAgentsForClient(clientId)` loads rows from
Supabase and ranks them).

Archetype scoring from raw assessment answers:
- Client: `backend/lib/clientAssessments.ts` (`calculateClientArchetype`)
- Agent: `backend/lib/agentAssessments.ts` (`calculateAgentArchetype`)

The frontend mirror lives in `frontend/shared/api.js` (`calculateClientArchetype`).

## Where notification logic lives

`backend/lib/messages.ts` — `createNotification`, `getAgentNotifications`,
`markNotificationRead`. Notification types:

- `client_link_opened`
- `client_assessment_started`
- `client_assessment_completed`
- `reviewer_match_received`
- `agent_archetype_completed`
- `system`

Each maps to a `messages.type` enum value for storage. The exact reviewer match
body is exported as `REVIEWER_MATCH_NOTIFICATION_BODY`:

> You've received a client match from REQUITY! If you have any issues message
> requity@support.com. Thank you for working with us.

## How QR-code clients differ from REQUITY reviewer matches

| | QR-code client (`source = 'qr'`) | REQUITY reviewer (`source = 'requity_reviewer'`) |
|---|---|---|
| Assignment | Attaches directly to the scanning agent | Assigned only after reviewer approval |
| Reviewer queue | Never enters it | Enters `match_recommendations` |
| Badge in dashboard | Normal status badge | **REQUITY Client Match** badge |
| On submit | `clients.status = 'assigned'`, agent notified | `clients.status = 'reviewer_matching'`, awaits review |
| Email | No reviewer match email | Brevo reviewer match email on approval |

Implementation: `clientAssessments.submitClientAssessment()` routes by source;
`reviewerMatches.approveReviewerMatch()` performs assignment + notification +
email for reviewer matches.

## Incomplete assessment lead capture (abandon tracking)

Goal: if a client starts the assessment but never finishes, REQUITY still keeps
their name/email/phone so reviewers can follow up.

**Privacy note:** contact details are only captured *after* the user
intentionally enters them on the contact step and starts the assessment.

Flow and the route that drives each step:

1. **Start** — when the client clicks "Continue to Assessment", the frontend
   (`client/assessment-script.js` → `RequityAPI.startAssessmentLead`) calls
   `POST /api/assessment-leads/start`. This creates an `assessment_leads` row with
   `status='started'` and the contact info. The `leadId` is kept in memory and
   `localStorage` so a refresh/return reuses the same lead.
2. **Progress** — after each answer (debounced ~1.2s),
   `RequityAPI.updateAssessmentLeadProgress` calls
   `POST /api/assessment-leads/progress`, updating `answered_count`,
   `partial_answers`, `last_activity_at`, and moving status to `in_progress`.
3. **Complete** — on final submit, the frontend includes `leadId` in
   `client-assessment/submit`. The server
   (`clientAssessments.submitClientAssessmentWithContact`) calls
   `completeAssessmentLead(...)`, setting `status='completed'`, `completed_at`, and
   `archetype`. (A standalone `POST /api/assessment-leads/complete` also exists.)
4. **Abandon** — if the client never completes, the lead simply stays
   `started`/`in_progress`. There is no job that flips it to `abandoned`
   automatically; reviewers mark it `abandoned` (or a future cron can, based on
   `last_activity_at`).

Dedupe / safety rules (`backend/lib/assessmentLeads.ts`):
- Reuse an existing lead by `client_assessment_id`, else by recent (24h)
  `email + source + agent/reviewer`.
- A **completed** lead is never reused or downgraded back to incomplete.

**Where reviewers see leads:** the reviewer dashboard
(`reviewer/index.html` → "Incomplete Assessments" section) calls
`GET /api/reviewer/assessment-leads` (reviewer/admin auth). It shows name, email,
phone, source badge, status badge, started/last-activity, answered count, assigned
agent (qr/agent_link), archetype if known, and notes. Actions (Mark Followed Up /
Mark Abandoned / Add Note) call `POST /api/reviewer/assessment-leads/update`. When
no API is configured, the section renders clean sample rows in demo mode.

**Follow-up email (disabled):** `createIncompleteAssessmentFollowUpDraft()` and
`sendIncompleteAssessmentFollowUpEmail()` in `assessmentLeads.ts` are placeholders
that do **not** send anything yet. An optional reviewer "lead started"
notification hook also exists but is gated off (`ENABLE_LEAD_START_NOTIFICATION`).
Do not enable automatic outreach until follow-up timing and consent are defined.

## Recommended wiring order

1. Run `schema.sql` in Supabase.
2. Add env vars in Vercel; add `frontend/shared/config.js` with the anon key.
3. Create Edge Functions / API routes that call the `backend/lib` functions
   (e.g. `/client-assessments/submit`, `/agent-assessments/submit`,
   `/agents/:id/clients`, `/agents/:id/messages`), then set `apiBaseUrl` in the
   frontend config to point at them.
4. Tighten the RLS policies in `schema.sql` before production.
