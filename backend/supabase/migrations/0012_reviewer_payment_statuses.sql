-- ============================================================================
-- REQUITY migration 0012. Reviewer payment status tracking.
--
-- WHY THIS EXISTS:
--   Reviewers need to mark agents AND consumer clients as paid/unpaid (agents
--   are also REQUITY clients). No payment table or column exists anywhere in
--   the schema, so this adds one generic, append-only status log:
--     - entity_type: 'agent' | 'client' | 'lead' | 'match'
--     - the CURRENT status of an entity is its newest row
--     - every update keeps full history (who, when, amount, note)
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
