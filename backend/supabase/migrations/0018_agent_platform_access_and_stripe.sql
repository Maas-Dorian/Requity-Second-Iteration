-- ============================================================================
-- REQUITY migration 0018. Agent platform access + Stripe one-time payment.
--
-- WHY THIS EXISTS:
--   REQUITY charges each NEW agent a one-time $50 platform access fee paid
--   through Stripe Checkout. This migration adds the single source of truth
--   for agent platform access directly on public.agents:
--     - access_status drives dashboard access (see backend/lib/agentAccess.ts)
--     - platform access is allowed ONLY for: grandfathered, paid, complimentary
--     - Stripe payment facts (customer, session, payment intent, amount) are
--       recorded next to the access state after a VERIFIED webhook confirms
--       payment; the browser can never grant access
--
-- GRANDFATHERING (critical):
--   Every agent that exists before the launch cutoff keeps full access forever
--   with access_status = 'grandfathered'. The cutoff is a FIXED timestamp so
--   re-running this migration later can never grandfather post-launch signups.
--
-- SAFETY:
--   - Idempotent (IF NOT EXISTS / guarded updates); safe to re-run on a
--     drifted live database.
--   - Purely additive: no existing table, column, or row is renamed, dropped,
--     or destructively modified. Old reviewer_payment_statuses history is kept.
--   - The grandfather update NEVER overwrites a finalized status
--     (paid / complimentary / refunded / suspended).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Access + Stripe columns on public.agents (additive, with safe defaults
--    for FUTURE rows: new agents require assessment then payment).
-- ----------------------------------------------------------------------------
alter table public.agents add column if not exists payment_required boolean not null default true;
alter table public.agents add column if not exists access_status text not null default 'assessment_required';
alter table public.agents add column if not exists access_granted_at timestamptz;
alter table public.agents add column if not exists access_granted_by uuid;
alter table public.agents add column if not exists access_grant_reason text;
alter table public.agents add column if not exists stripe_customer_id text;
alter table public.agents add column if not exists stripe_checkout_session_id text;
alter table public.agents add column if not exists stripe_payment_intent_id text;
alter table public.agents add column if not exists stripe_payment_status text;
alter table public.agents add column if not exists stripe_paid_at timestamptz;
alter table public.agents add column if not exists stripe_amount_paid integer;
alter table public.agents add column if not exists stripe_currency text;
alter table public.agents add column if not exists grandfathered_at timestamptz;
alter table public.agents add column if not exists complimentary_access boolean not null default false;
alter table public.agents add column if not exists complimentary_access_granted_at timestamptz;
alter table public.agents add column if not exists complimentary_access_granted_by uuid;
alter table public.agents add column if not exists complimentary_access_note text;

-- Allowed access statuses only. Recreated idempotently.
alter table public.agents drop constraint if exists agents_access_status_check;
alter table public.agents add constraint agents_access_status_check
  check (access_status in (
    'grandfathered',
    'assessment_required',
    'payment_required',
    'checkout_started',
    'payment_pending',
    'paid',
    'complimentary',
    'payment_failed',
    'refunded',
    'suspended'
  ));

-- ----------------------------------------------------------------------------
-- 2) Grandfather all agents that existed before the FIXED launch cutoff.
--    The cutoff is a literal timestamp (never now()/Date.now()), so re-running
--    this migration after launch cannot grandfather new signups. Finalized
--    statuses (paid / complimentary / refunded / suspended / grandfathered)
--    are never overwritten.
-- ----------------------------------------------------------------------------
update public.agents
set
  payment_required = false,
  access_status = 'grandfathered',
  grandfathered_at = now(),
  access_granted_at = now(),
  access_grant_reason = 'existing_agent_grandfathered'
where created_at < timestamptz '2026-07-15 00:00:00+00'
  and access_status in ('assessment_required', 'payment_required', 'checkout_started', 'payment_pending', 'payment_failed');

-- ----------------------------------------------------------------------------
-- 3) Indexes for access checks and Stripe lookups.
-- ----------------------------------------------------------------------------
create index if not exists idx_agents_access_status on public.agents(access_status);
create index if not exists idx_agents_payment_required on public.agents(payment_required);
create index if not exists idx_agents_stripe_checkout_session_id on public.agents(stripe_checkout_session_id);
create index if not exists idx_agents_stripe_customer_id on public.agents(stripe_customer_id);

-- ----------------------------------------------------------------------------
-- 4) Stripe webhook idempotency log. One row per received Stripe event id;
--    processing the same event twice is a safe no-op.
-- ----------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz,
  status text,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_stripe_webhook_events_event_type
  on public.stripe_webhook_events(event_type);
create index if not exists idx_stripe_webhook_events_created_at
  on public.stripe_webhook_events(created_at);

-- Server-side access only (the webhook route uses the service role, which
-- bypasses RLS). NO public policies: webhook data is never browser-readable.
alter table public.stripe_webhook_events enable row level security;

notify pgrst, 'reload schema';
