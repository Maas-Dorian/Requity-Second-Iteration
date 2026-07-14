# REQUITY Analytics Event Registry

Vercel Web Analytics custom events for the client, agent, matching, and
operational funnels.

- Client-side events go through `frontend/shared/analytics.js`
  (`window.RequityAnalytics.track` / `trackOnce`), which wraps the Vercel
  beacon (`/_vercel/insights/script.js`, called via `window.va("event", ...)`).
- Server-side events go through `backend/lib/vercelAnalytics.ts`
  (`trackServerEvent`, using `import { track } from "@vercel/analytics/server"`).
  Server event names are centralized in `ANALYTICS_EVENTS` in that file.
- Package: `@vercel/analytics` 2.0.1 (requirement is at least 1.1.0).

## Privacy rules (enforced in both helpers)

- Properties must be flat primitives: string, number, boolean, or null.
- Nested objects and arrays are rejected. Undefined properties are removed.
- Strings are truncated to 255 characters. Max 20 properties per event.
- Never sent: names, email addresses, phone numbers, street addresses,
  assessment answer values, open-ended text, passwords, tokens, Supabase user
  ids, or raw database ids.
- Markets are sent as lowercase slugs (for example `dallas`). Distances, fit
  scores, payment amounts, and counts are sent as coarse bands.

## Plan limitation

Custom events require a supported Vercel plan (Pro or Enterprise). On an
unsupported plan the helpers silently no-op: page analytics keep working and
no business flow is affected. If REQUITY ever moves analytics providers, both
helpers are single entry points that can be re-pointed to PostHog, GA4, or
another platform without touching call sites.

## Duplicate prevention summary

- Once-per-session events use `sessionStorage` flags (prefix `rq_evt_`):
  assessment started, progress milestones, video milestones, signup started.
- Once-per-page-lifetime events use in-memory flags: question viewed,
  video impression.
- Server events fire only after the database operation succeeds, and email
  events piggyback on the existing `email_events` dedupe layer.
- Client intent and server confirmation use DIFFERENT event names:
  `client_assessment_complete_clicked` (intent) vs `client_assessment_completed`
  (confirmed), `agent_signup_submit_clicked` vs `agent_signup_completed`.

## UTM and attribution

`frontend/shared/analytics.js` captures `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content`, `utm_term`, plus a NORMALIZED referrer
(google, bing, facebook, instagram, tiktok, linkedin, social, search, direct,
referral, other; full referrer URLs are never stored) and a landing path
group. Stored once in `localStorage` under `requity_attribution_v1`
(first-touch; never overwritten; internal navigation never counts as first
touch). Safe attribution fields are attached to `landing_page_viewed`,
`client_cta_clicked`, `client_assessment_viewed`, and the completion intent
events. Server completion events carry categorical funnel fields; the
database rows remain the business source of truth.

---

## Part 1: Landing pages and acquisition (client-side)

Fired automatically by `frontend/shared/analytics.js` on pages that declare
`window.REQUITY_PAGE_TYPE` (homepage `generic`, market pages `market`,
buyer/seller pages, resource pages via the generators).

| Event | Fires | Dedupe | Properties |
| --- | --- | --- | --- |
| `landing_page_viewed` | Page load on any client-facing landing page | Once per page load | page_type, market, path_group, referrer_type, utm_source, utm_medium, utm_campaign, utm_content, device_type, location_choice |
| `founder_video_impression` | Founder video section first enters viewport (40 percent visible) | Once per session | page_type, market, video_id |
| `founder_video_started` | First playback start | Once per session | page_type, market, video_id |
| `founder_video_25_percent` / `_50_percent` / `_75_percent` | Playback position crosses the milestone | Once per session; seeks/replays never re-fire | page_type, market, video_id |
| `founder_video_completed` | Video ends | Once per session | page_type, market, video_id |
| `client_cta_clicked` | Click on any "Find your agent" CTA (`data-assessment-cta` or an assessment link) | Per click | page_type, market, cta_location (hero, video_section, how_it_works, footer, resource), destination, utm_source, utm_campaign |
| `agent_cta_clicked` | Click on a link into `/agent/` | Per click | page_type, market, cta_location, destination (agent_login, agent_information) |

Location prompt (`client/market-location.js`, homepage only; no coordinates
are ever sent):

| Event | Fires |
| --- | --- |
| `location_prompt_shown` | Banner shown (only shown once ever per browser) |
| `location_permission_allowed` | User allowed geolocation (props: nearest_market, within_market_radius) |
| `location_permission_declined` | User declined |
| `location_permission_unavailable` | Geolocation errored or timed out |
| `market_page_routed` | Visitor routed to a market landing page (props: market) |

## Part 2: Client assessment funnel (client-side, `client/assessment-script.js`)

Question ids are safe categorical labels (for example `communication_style`),
never the question text or the answer value.

| Event | Fires | Dedupe | Key properties |
| --- | --- | --- | --- |
| `client_assessment_viewed` | Assessment page load | Per page load | market, transaction_type, source_page, utm_source, utm_campaign |
| `client_assessment_resumed` | Page load with an unfinished progress marker from a previous session | Per detection | last_question_id, last_question_index, completion_percent, hours_since_last_activity |
| `client_contact_step_started` | First interaction with an intake field or goal card | Once per session | market, transaction_type |
| `client_contact_step_completed` | Start Assessment clicked | Per click | fields_completed_count, has_phone, has_email (booleans only) |
| `client_assessment_started` | Start Assessment clicked (first meaningful action) | Once per session (sessionStorage) | market, source_page, transaction_type, total_questions, device_type |
| `client_transaction_type_selected` | Goal card clicked (skipped during prefill) | Per selection | transaction_type (buying, selling, buying_and_selling, general), market |
| `client_assessment_question_viewed` | A question becomes the active question | Once per question per page | question_id, question_category, question_index, total_questions, completion_percent, transaction_type, market |
| `client_assessment_question_answered` | A valid answer is chosen (first pick or a change) | First answer + changes only | same as viewed + answer_type, was_changed. Answer VALUES are never sent |
| `client_assessment_back_clicked` | Previous clicked inside the questions | Per click | from_question_id, from_question_index, to_question_id |
| `client_assessment_progress_25` / `_50` / `_75` / `_90` | Progress crosses the milestone | Once per session (sessionStorage) | market, transaction_type, current_question_id, elapsed_seconds |
| `client_assessment_complete_clicked` | Complete Assessment clicked (intent only) | Per attempt | market, transaction_type, total_questions, elapsed_seconds, has_expectations_notes, has_appreciation_style |
| `client_assessment_paused` | Tab hidden or page unload with a started, unfinished assessment (at least 5s in, throttled to one per 30s) | Throttled | last_question_id, last_question_index, completion_percent, elapsed_seconds |
| `frontend_error_occurred` | Assessment submit failed in the browser | Per failure | feature=client_assessment, error_code, route_group |

## Part 2b: Client assessment (server-side, source of truth)

| Event | Fires | Where |
| --- | --- | --- |
| `client_assessment_completed` | ONLY after the API validated the submission and the database write succeeded | `api/client-assessment/submit.ts`. Props: market, transaction_type, total_questions, source_page, has_expectations_notes, has_appreciation_style, assessment_version, is_returning_session, submission_type (new, resumed) |
| `client_assessment_submission_failed` | Submission failed server-side | Same file. Props: failure_stage (validation, database), transaction_type, market, error_code (HTTP status class only, never raw error text) |
| `reviewer_client_review_started` | Completed assessment enters the reviewer queue | `backend/lib/clientAssessments.ts`. Props: transaction_type, market, client_status, has_appreciation_style, has_expectations_notes, assessment_version |
| `client_match_review_started` | Same trigger, match-funnel view | Same file. Props: transaction_type, market, required_lane_count |

Abandonment (`client_assessment_abandoned_24h`) is intentionally NOT a
tracked event. It is a derived metric: started minus completed within the
chosen attribution window (see Derived metrics). The `assessment_leads` table
already stores started/completed timestamps and remains the database source
of truth for abandonment analysis.

## Part 4 and 5: Agent funnel

Client-side (`agent/login.html`, `agent/script.js`, `agent/dashboard.html`):

| Event | Fires | Dedupe |
| --- | --- | --- |
| `agent_signup_page_viewed` | Agent login/signup page load | Per page load |
| `agent_signup_started` | First input in the signup form | Once per session |
| `agent_signup_validation_error` | Terms unchecked or signup rejected | Per error (field values never sent) |
| `agent_signup_submit_clicked` | Create agent account clicked (intent) | Per attempt |
| `agent_assessment_started` | Agent assessment questions begin | Once per session |
| `agent_assessment_question_viewed` / `agent_assessment_question_answered` | Question shown / first answer chosen | Once per question |
| `agent_dashboard_viewed` | Dashboard data loaded | Per page load. Props: active_match_count_band, unread_message_count_band, payment_status, has_announcement |
| `agent_client_assessment_viewed` | Agent opens a matched client's assessment | Per open. Props: match_status, is_legacy |
| `agent_announcement_viewed` / `agent_announcement_dismissed` / `agent_announcement_cta_clicked` | Announcements banner | Per action. Props: priority, audience_type, has_cta (never title or body) |

Server-side (source of truth):

| Event | Fires | Where |
| --- | --- | --- |
| `agent_account_created` | Supabase account + brand-new profile created | `api/auth/bootstrap-agent.ts` (sign-in auto-bootstrap never re-fires it) |
| `agent_signup_completed` | Profile AND agent row exist for a new signup | Same file. Props: signup_source, has_phone, has_location, has_license_info, payment_status, assessment_required |
| `agent_assessment_completed` | Agent assessment saved to the database | `api/agent-assessment/submit.ts`. Props: market, assessment_version, total_questions, has_archetype |
| `agent_assessment_update_requested` | Reviewer requests a retake | `api/reviewer/request-agent-assessment-update.ts` |
| `agent_payment_status_changed` | Reviewer updates an agent payment status | `backend/lib/payments.ts`. Props: previous_status, new_status, amount_band (zero, under_50, 50_to_99, 100_to_249, 250_plus, unknown; exact amounts never sent), payment_type, changed_by |

Email verification callbacks do not exist server-side, so
`agent_email_verified` is not implemented; verification completion shows up as
the first successful `login_succeeded`.

## Part 5b: Agent platform access payments (Stripe, one-time $50)

Client-side (`agent/assessment-results.html`, `agent/activate-access.html`):

| Event | Fires | Key properties |
| --- | --- | --- |
| `agent_assessment_results_viewed` | Assessment results page rendered | archetype_present, style_present, access_status |
| `agent_payment_page_viewed` | Activate-access page rendered | amount (50), currency (usd), access_status |
| `agent_checkout_started` | Pay $50 securely clicked (intent) | amount, currency |
| `agent_checkout_cancelled` | Returned from Stripe with payment=cancelled | amount, currency |

Server-side (source of truth; Stripe identifiers, agent ids, and emails are
NEVER sent to analytics):

| Event | Fires | Where |
| --- | --- | --- |
| `agent_checkout_session_created` | Stripe Checkout Session created | `api/agent/create-access-checkout-session.ts`. Props: amount, currency, access_status_before |
| `agent_payment_completed` | Verified webhook confirms payment (idempotent; replays never re-fire) | `backend/lib/agentAccess.ts`. Props: amount, currency, payment_method_type, grant_type (stripe) |
| `agent_payment_failed` | Async payment failed webhook | Same file. Props: amount, currency |
| `agent_payment_refunded` | Full refund webhook | Same file. Props: amount, currency |
| `agent_platform_access_granted` | Access granted (any path) | Same file. Props: grant_type (stripe, complimentary) |
| `reviewer_complimentary_access_granted` | Reviewer grants free access | Same file. Props: previous_status |
| `reviewer_complimentary_access_revoked` | Reviewer revokes free access | Same file. Props: restored_status |

## Part 6 and 7: Matching and reviewer

Client-side (`reviewer/script.js`):

| Event | Fires | Key properties |
| --- | --- | --- |
| `reviewer_lane_selected` | Lane pill clicked on the Match Desk | lane, transaction_type |
| `reviewer_agent_search_used` | Agent search input (debounced) | lane, result_count, filter_count, search_has_text (search TEXT never sent) |
| `reviewer_agent_selected` | Agent selected on the Match Desk | lane, distance_band, fit_band, agent_payment_status, active_match_count_band (agent identity never sent) |
| `reviewer_assessment_opened` | View full assessment (Match Desk) or Client assessment dropdown (Paired Clients) | location (match_desk, paired_clients), transaction_type, lane, is_legacy |

Server-side (source of truth, `backend/lib/reviewerMatches.ts`):

| Event | Fires | Key properties |
| --- | --- | --- |
| `reviewer_match_completed` | After the match database write succeeds | lane, transaction_type, market, fit_band, same_agent_for_both, notify_client, notify_agent, time_from_assessment_hours, match_type (first, replacement) |
| `reviewer_match_changed` | A replacement superseded an existing match | lane, transaction_type, market, change_reason_category, previous_match_age_days, notify_previous_agent |
| `reviewer_match_removed` | Reviewer unmatches an active match | lane, removal_reason_category, moved_to_history |
| `client_partial_match_completed` | Buying-and-selling client has one lane matched, one remaining | completed_lane, remaining_lane, market |
| `client_match_fully_completed` | The client's FULL match is complete (single lane, or both lanes, or one both-agent) | transaction_type, market, agent_count, time_to_match_hours, same_agent_for_both, client_email_sent |
| `client_final_match_email_sent` | The one client-facing final match email was attempted | transaction_type, market, agent_count, send_type (initial, resend), provider_status |
| `match_email_sent` | Any match-related email attempt (in `backend/lib/email.ts` sendAppEmail) | recipient_type (agent, client, reviewer), email_type, lane, send_type (initial, resend, replacement), provider_status (sent, failed, skipped, rate_limited). Recipient address never sent. Deduped sends are not tracked |

## Part 9: Auth and password reset

Client-side (`agent/login.html`, `agent/reset-password.html`). Note: sign-in
runs directly against Supabase Auth from the browser, so login outcome events
fire client-side here; there is no server login endpoint to hook.

| Event | Fires |
| --- | --- |
| `login_page_viewed` | Login page load (user_type agent) |
| `login_attempted` | Sign in submitted |
| `login_succeeded` | Supabase sign-in succeeded |
| `login_failed` | Sign-in rejected (failure_category; email never sent) |
| `password_reset_requested_client` | Reset link requested (intent) |
| `password_reset_link_opened` | Recovery link opened (token_present, page_status; the token itself is never sent) |

Server-side:

| Event | Where | Notes |
| --- | --- | --- |
| `password_reset_requested` | `api/auth/request-password-reset.ts` | account_found is deliberately NOT included, so analytics can never become an account-enumeration oracle |
| `password_reset_completed` | `api/auth/complete-password-reset.ts` | after the password update succeeded |
| `password_reset_failed` | Same file | failure_category: invalid_token, expired_token, used_token, weak_password, server, unknown |

## Part 10: Errors and reliability

| Event | Side | Fires |
| --- | --- | --- |
| `frontend_error_occurred` | client | Known feature failures (client assessment submit). Props: feature, error_code, route_group. Stack traces are never sent; use Vercel runtime logs |
| `client_assessment_submission_failed` | server | see Part 2b |
| `api_operation_failed` | server | Reserved in `ANALYTICS_EVENTS` for future wiring into the shared API error handler; detailed server errors live in Vercel runtime logs today |

---

## Derived metrics

Client acquisition:

- Landing to CTA rate = `client_cta_clicked` / `landing_page_viewed`
- CTA to assessment start = `client_assessment_started` / `client_cta_clicked`
- Assessment completion rate = `client_assessment_completed` / `client_assessment_started`
- Assessment abandonment rate = (`client_assessment_started` - `client_assessment_completed`) / `client_assessment_started` over the chosen window
- Question-level drop-off: for each question_index, `client_assessment_question_viewed` at index N minus viewed at index N+1 (the final question compares against `client_assessment_completed`)
- Median completion time: median `elapsed_seconds` on `client_assessment_complete_clicked`
- Market conversion rate = `client_assessment_completed` by market / `landing_page_viewed` by market
- Transaction mix: `client_assessment_completed` grouped by transaction_type
- Video influence (directional only, not causal): assessment start rate in sessions with `founder_video_started` vs sessions without

Agent acquisition:

- Signup start rate = `agent_signup_started` / `agent_signup_page_viewed`
- Signup completion = `agent_signup_completed` / `agent_signup_started`
- Agent assessment completion = `agent_assessment_completed` / `agent_assessment_started`
- Agent activation = agents with `agent_signup_completed`, `agent_assessment_completed`, and `agent_dashboard_viewed`

Matching operations:

- Assessment to review rate = `reviewer_client_review_started` / `client_assessment_completed`
- Assessment to full match rate = `client_match_fully_completed` / `client_assessment_completed`
- Average time to match: mean `time_to_match_hours` on `client_match_fully_completed`
- Replacement rate = `reviewer_match_changed` / `reviewer_match_completed`
- Match email success rate = `match_email_sent` with provider_status sent / all `match_email_sent`
- Reviewer throughput = `reviewer_match_completed` per day or week

Buying and selling:

- Both-lane completion rate = `client_match_fully_completed` with transaction_type buying_and_selling / `client_assessment_completed` with transaction_type buying_and_selling
- Partial match backlog = `client_partial_match_completed` without a later `client_match_fully_completed`
- Lane gap: time between `client_partial_match_completed` and `client_match_fully_completed`

Agent engagement:

- Matched assessment open rate = `agent_client_assessment_viewed` / `match_email_sent` with recipient_type agent
- Announcement engagement = `agent_announcement_cta_clicked` / `agent_announcement_viewed`

## Finding events in Vercel

Vercel dashboard > the REQUITY project > Analytics > Events. Each custom
event appears by name with its property breakdowns; filter by property values
(for example market or transaction_type) to build the funnels above. Custom
events require the Web Analytics Plus tier (Pro or Enterprise plan).
