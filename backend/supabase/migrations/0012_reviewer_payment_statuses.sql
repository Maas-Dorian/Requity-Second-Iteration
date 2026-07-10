-- ============================================================================
-- REQUITY migration 0012. Reviewer payment status tracking (AGENTS ONLY).
--
-- WHY THIS EXISTS:
--   Reviewers need to track agent payments: agents are REQUITY's paying
--   clients (membership / network fees). Consumer buyers and sellers are
--   never billed and never get a payment status. This adds one append-only
--   status log:
--     - the application only ever writes entity_type = 'agent' with
--       entity_id = the agent's id
--     - the CURRENT status of an agent is its newest row
--     - every update keeps full history (who, when, amount, note)
--
--   The entity_type check constraint allows more values ('client', 'lead',
--   'match') purely for future flexibility. The API and UI reject anything
--   that is not 'agent'; do not create non-agent rows.
--
-- SAFETY:
--   - Idempotent (IF NOT EXISTS everywhere).
--   - Purely additive: creates one new table + indexes. No existing table,
--     column, or row is renamed, dropped, or modified.
-- ============================================================================

create table if not exists public.reviewer_payment_statuses (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'unpaid',
  amount_cents integer,
  currency text default 'USD',
  note text,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Allowed entity types and payment statuses only.
alter table public.reviewer_payment_statuses
  drop constraint if exists reviewer_payment_statuses_entity_type_check;
alter table public.reviewer_payment_statuses
  add constraint reviewer_payment_statuses_entity_type_check
  check (entity_type in ('agent', 'client', 'lead', 'match'));

alter table public.reviewer_payment_statuses
  drop constraint if exists reviewer_payment_statuses_status_check;
alter table public.reviewer_payment_statuses
  add constraint reviewer_payment_statuses_status_check
  check (status in ('unpaid', 'invoice_sent', 'paid', 'waived', 'refunded', 'not_required'));

create index if not exists idx_reviewer_payment_statuses_entity
  on public.reviewer_payment_statuses(entity_type, entity_id);
create index if not exists idx_reviewer_payment_statuses_status
  on public.reviewer_payment_statuses(status);
create index if not exists idx_reviewer_payment_statuses_updated_at
  on public.reviewer_payment_statuses(updated_at);

-- Server-side access only (the API uses the service role, which bypasses RLS).
-- No anon/authenticated policies: payment data is reviewer/admin territory.
alter table public.reviewer_payment_statuses enable row level security;

notify pgrst, 'reload schema';
