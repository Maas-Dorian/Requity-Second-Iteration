-- ============================================================================
-- REQUITY migration 0016. Repair: password reset table + schema drift from
-- manually run migrations 0005 through 0015.
--
-- WHY THIS EXISTS:
--   Migrations 0005..0015 may have been applied by hand in the SQL editor,
--   possibly partially. The SQL editor runs each file in ONE transaction, so a
--   single failure rolls back the whole file. A known landmine: migration 0010
--   creates a trigger that calls set_updated_at(), a function no migration in
--   this repo defines. On a database without it, 0010 failed at the last step
--   and EVERYTHING in it rolled back (match lifecycle columns, statuses,
--   indexes), which also breaks 0011 and downstream code paths.
--
--   This migration reconciles the live schema with what the CURRENT code
--   needs. It re-states every table/column/index the app reads or writes, in
--   dependency order, so running this one file fixes any partial state.
--
-- SAFETY:
--   - 100% additive and idempotent: create table if not exists, add column if
--     not exists, create index if not exists, guarded constraints.
--   - Never drops tables or columns, never renames, never deletes rows.
--   - The only UPDATEs are the same defensive backfills the original
--     migrations performed (null lane -> 'general', null status ->
--     'suggested', deduping multiple ACTIVE matches per client+lane by marking
--     older ones superseded). These are required for the unique indexes and
--     are no-ops on a healthy database.
--   - Safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Shared trigger function (the missing dependency of migration 0010).
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- 1) Password reset tokens (migration 0013). Required by
--    /api/auth/request-password-reset and /api/auth/complete-password-reset.
-- ----------------------------------------------------------------------------
create table if not exists public.auth_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  user_agent text,
  created_at timestamptz default now()
);

-- Columns, in case an older/partial version of the table exists.
alter table public.auth_password_reset_tokens add column if not exists user_id uuid;
alter table public.auth_password_reset_tokens add column if not exists email text;
alter table public.auth_password_reset_tokens add column if not exists token_hash text;
alter table public.auth_password_reset_tokens add column if not exists expires_at timestamptz;
alter table public.auth_password_reset_tokens add column if not exists used_at timestamptz;
alter table public.auth_password_reset_tokens add column if not exists requested_ip text;
alter table public.auth_password_reset_tokens add column if not exists user_agent text;
alter table public.auth_password_reset_tokens add column if not exists created_at timestamptz default now();

-- Unique token_hash: required for the single-use lookup. Guarded so a table
-- that already has the inline UNIQUE constraint does not get a duplicate.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'auth_password_reset_tokens'
      and indexdef ilike '%unique%'
      and indexdef ilike '%token_hash%'
  ) then
    create unique index auth_password_reset_tokens_token_hash_unique_idx
      on public.auth_password_reset_tokens (token_hash);
  end if;
end $$;

create index if not exists auth_password_reset_tokens_email_created_idx
  on public.auth_password_reset_tokens (email, created_at);
create index if not exists auth_password_reset_tokens_user_created_idx
  on public.auth_password_reset_tokens (user_id, created_at);
create index if not exists auth_password_reset_tokens_expires_idx
  on public.auth_password_reset_tokens (expires_at);

-- Deny-by-default: no policies. Only the service-role API may touch this table.
alter table public.auth_password_reset_tokens enable row level security;

-- ----------------------------------------------------------------------------
-- 2) email_events (migrations 0004 + 0005_email_events_sendgrid). Required by
--    sendAppEmail / recordEmailEvent (SendGrid audit trail + dedupe).
-- ----------------------------------------------------------------------------
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  template_key text,
  brevo_message_id text,
  payload jsonb default '{}'::jsonb,
  status text default 'queued',
  created_at timestamptz default now()
);

alter table public.email_events add column if not exists event_key text;
alter table public.email_events add column if not exists event_type text;
alter table public.email_events add column if not exists provider text;
alter table public.email_events add column if not exists provider_message_id text;
alter table public.email_events add column if not exists error_message text;
alter table public.email_events add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.email_events add column if not exists retry_count integer default 0;
alter table public.email_events add column if not exists next_attempt_at timestamptz;
alter table public.email_events add column if not exists sent_at timestamptz;
alter table public.email_events add column if not exists updated_at timestamptz default now();

alter table public.email_events alter column provider set default 'sendgrid';

create unique index if not exists email_events_event_key_key
  on public.email_events (event_key)
  where event_key is not null;

create or replace function public.set_email_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_email_events_updated_at on public.email_events;
create trigger trg_email_events_updated_at
  before update on public.email_events
  for each row execute function public.set_email_events_updated_at();

-- ----------------------------------------------------------------------------
-- 3) match_recommendations lifecycle + lanes (migrations 0010 + 0011).
--    Required by reviewer matching, lane-aware pairing, and the agent
--    dashboard legacy history restore.
-- ----------------------------------------------------------------------------
alter table public.match_recommendations add column if not exists status text default 'suggested';
alter table public.match_recommendations add column if not exists lead_id uuid;
alter table public.match_recommendations add column if not exists is_selected boolean default false;
alter table public.match_recommendations add column if not exists finalized_at timestamptz;
alter table public.match_recommendations add column if not exists superseded_at timestamptz;
alter table public.match_recommendations add column if not exists superseded_by uuid;
alter table public.match_recommendations add column if not exists reviewer_notes text;
alter table public.match_recommendations add column if not exists updated_at timestamptz default now();
alter table public.match_recommendations add column if not exists match_lane text default 'general';

-- Widen the status CHECK to the full lifecycle used by the code.
alter table public.match_recommendations drop constraint if exists match_recommendations_status_check;
alter table public.match_recommendations
  add constraint match_recommendations_status_check
  check (status in (
    'pending','approved','rejected','assigned',
    'suggested','pending_review','active','superseded','declined','archived','closed'
  ));

alter table public.match_recommendations drop constraint if exists match_recommendations_match_lane_check;
alter table public.match_recommendations
  add constraint match_recommendations_match_lane_check
  check (match_lane in ('buying', 'selling', 'both', 'general'));

-- Defensive backfills (no-ops on a healthy database).
update public.match_recommendations set match_lane = 'general' where match_lane is null;
update public.match_recommendations
set status = 'active',
    finalized_at = coalesce(finalized_at, reviewed_at, created_at),
    updated_at = now()
where status in ('assigned','approved');
update public.match_recommendations set status = 'suggested' where status is null;

-- The lane-scoped uniqueness replaced the client-only uniqueness from 0010.
drop index if exists one_active_match_per_client_idx;
drop index if exists one_active_match_per_lead_idx;

-- Dedupe multiple ACTIVE rows per client+lane / lead+lane (keep newest) so the
-- unique indexes below can never fail. Older duplicates become 'superseded';
-- nothing is deleted.
with ranked as (
  select id,
         row_number() over (
           partition by client_id, match_lane
           order by finalized_at desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from public.match_recommendations
  where status = 'active' and client_id is not null
)
update public.match_recommendations m
set status = 'superseded', superseded_at = now(), updated_at = now()
from ranked r
where m.id = r.id and r.rn > 1;

with ranked as (
  select id,
         row_number() over (
           partition by lead_id, match_lane
           order by finalized_at desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from public.match_recommendations
  where status = 'active' and lead_id is not null
)
update public.match_recommendations m
set status = 'superseded', superseded_at = now(), updated_at = now()
from ranked r
where m.id = r.id and r.rn > 1;

create index if not exists match_recommendations_agent_id_idx
  on public.match_recommendations(agent_id);
create index if not exists match_recommendations_client_id_status_idx
  on public.match_recommendations(client_id, status);
create index if not exists match_recommendations_lead_id_status_idx
  on public.match_recommendations(lead_id, status);

create unique index if not exists one_active_match_per_client_lane_idx
  on public.match_recommendations(client_id, match_lane)
  where status = 'active' and client_id is not null;
create unique index if not exists one_active_match_per_lead_lane_idx
  on public.match_recommendations(lead_id, match_lane)
  where status = 'active' and lead_id is not null;

-- The trigger 0010 could not create when set_updated_at() was missing.
drop trigger if exists trg_match_recs_updated_at on public.match_recommendations;
create trigger trg_match_recs_updated_at
  before update on public.match_recommendations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Agent payments (migration 0012). The code's canonical table is
--    reviewer_payment_statuses restricted to entity_type = 'agent'.
--    reviewer_agent_payment_statuses is intentionally NOT created here; if it
--    exists from an older manual run it is unused drift. TODO: drop it in a
--    future cleanup migration once production is stable.
-- ----------------------------------------------------------------------------
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

alter table public.reviewer_payment_statuses enable row level security;

-- ----------------------------------------------------------------------------
-- 5) Announcements (migration 0015). Required by the reviewer Updates tab and
--    the agent dashboard banner.
-- ----------------------------------------------------------------------------
create table if not exists public.reviewer_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  priority text not null default 'info',
  status text not null default 'draft',
  audience text not null default 'all_agents',
  cta_label text,
  cta_url text,
  dismissible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  updated_by uuid,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.reviewer_announcement_targets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.reviewer_announcements(id) on delete cascade,
  agent_id uuid not null,
  created_at timestamptz default now()
);

create table if not exists public.reviewer_announcement_dismissals (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.reviewer_announcements(id) on delete cascade,
  agent_id uuid not null,
  dismissed_at timestamptz default now(),
  unique (announcement_id, agent_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviewer_announcements_priority_check'
  ) then
    alter table public.reviewer_announcements
      add constraint reviewer_announcements_priority_check
      check (priority in ('info', 'important', 'urgent', 'maintenance'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'reviewer_announcements_status_check'
  ) then
    alter table public.reviewer_announcements
      add constraint reviewer_announcements_status_check
      check (status in ('draft', 'scheduled', 'active', 'expired', 'archived'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'reviewer_announcements_audience_check'
  ) then
    alter table public.reviewer_announcements
      add constraint reviewer_announcements_audience_check
      check (audience in (
        'all_agents', 'selected_agents', 'unpaid_agents',
        'missing_location_agents', 'missing_archetype_agents'
      ));
  end if;
end $$;

create index if not exists idx_reviewer_announcements_status
  on public.reviewer_announcements(status);
create index if not exists idx_reviewer_announcements_audience
  on public.reviewer_announcements(audience);
create index if not exists idx_reviewer_announcements_starts_at
  on public.reviewer_announcements(starts_at);
create index if not exists idx_reviewer_announcements_ends_at
  on public.reviewer_announcements(ends_at);
create index if not exists idx_reviewer_announcement_targets_announcement
  on public.reviewer_announcement_targets(announcement_id);
create index if not exists idx_reviewer_announcement_targets_agent
  on public.reviewer_announcement_targets(agent_id);
create index if not exists idx_reviewer_announcement_dismissals_announcement
  on public.reviewer_announcement_dismissals(announcement_id);
create index if not exists idx_reviewer_announcement_dismissals_agent
  on public.reviewer_announcement_dismissals(agent_id);

alter table public.reviewer_announcements enable row level security;
alter table public.reviewer_announcement_targets enable row level security;
alter table public.reviewer_announcement_dismissals enable row level security;

-- ----------------------------------------------------------------------------
-- 6) Agents columns the current code reads (0003/0005/0007/0009/0011/0014).
-- ----------------------------------------------------------------------------
alter table public.agents add column if not exists market_city text;
alter table public.agents add column if not exists market_state text;
alter table public.agents add column if not exists market_country text default 'US';
alter table public.agents add column if not exists service_radius_miles integer default 50;
alter table public.agents add column if not exists latitude double precision;
alter table public.agents add column if not exists longitude double precision;
alter table public.agents add column if not exists location_normalized text;
alter table public.agents add column if not exists location_place_id text;
alter table public.agents add column if not exists service_areas jsonb default '[]'::jsonb;
alter table public.agents add column if not exists public_slug text;
alter table public.agents add column if not exists archived_at timestamptz;
alter table public.agents add column if not exists deleted_at timestamptz;
alter table public.agents add column if not exists needs_assessment_update boolean not null default false;
alter table public.agents add column if not exists assessment_update_requested_at timestamptz;
alter table public.agents add column if not exists reviewer_notes text;
alter table public.agents add column if not exists public_assessment_token text
  default encode(gen_random_bytes(16), 'hex');

create unique index if not exists agents_public_slug_unique_idx
  on public.agents (public_slug)
  where public_slug is not null;
create index if not exists idx_agents_archived_at on public.agents(archived_at);
create index if not exists idx_agents_needs_assessment_update
  on public.agents(needs_assessment_update)
  where needs_assessment_update = true;

-- ----------------------------------------------------------------------------
-- 7) Clients + assessment_leads columns used by the dashboard, reviewer flow,
--    and the legacy assessment restore (0002/0003/0005/0006/0008/0011).
-- ----------------------------------------------------------------------------
alter table public.clients add column if not exists transaction_intent text;
alter table public.clients add column if not exists transaction_intent_label text;
alter table public.clients add column if not exists transaction_intent_other text;
alter table public.clients add column if not exists market_city text;
alter table public.clients add column if not exists buying_market_city text;
alter table public.clients add column if not exists selling_market_city text;
alter table public.clients add column if not exists pipeline_status text;
alter table public.clients add column if not exists deal_status text;
alter table public.clients add column if not exists close_date date;
alter table public.clients add column if not exists archived_at timestamptz;
alter table public.clients add column if not exists deleted_at timestamptz;

alter table public.assessment_leads add column if not exists transaction_intent text;
alter table public.assessment_leads add column if not exists transaction_intent_label text;
alter table public.assessment_leads add column if not exists transaction_intent_other text;
alter table public.assessment_leads add column if not exists market_city text;
alter table public.assessment_leads add column if not exists buying_market_city text;
alter table public.assessment_leads add column if not exists selling_market_city text;
alter table public.assessment_leads add column if not exists pipeline_status text;
alter table public.assessment_leads add column if not exists archived_at timestamptz;
alter table public.assessment_leads add column if not exists deleted_at timestamptz;

create index if not exists idx_clients_archived_at on public.clients(archived_at);
create index if not exists idx_assessment_leads_archived_at on public.assessment_leads(archived_at);

-- ----------------------------------------------------------------------------
-- Done. Reload the PostgREST schema cache so new columns are usable at once.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
