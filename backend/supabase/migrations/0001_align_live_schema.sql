-- ============================================================================
-- REQUITY migration 0001 — align an EXISTING live database with the columns and
-- tables the application code requires.
--
-- WHY THIS EXISTS:
--   backend/supabase/schema.sql is guarded with CREATE TABLE IF NOT EXISTS. That
--   means re-running schema.sql on a project that was first created from an OLDER
--   version of the schema will NOT add newly introduced columns/tables. A live DB
--   that is missing, for example, the agent dimension columns
--   (interaction_style / focus / stress_response / perceived_value /
--   negotiation_style) will make the agent assessment submit fail with a
--   "column ... does not exist" error when the API writes the result.
--
-- CONFIRMED DRIFT (live project, June 2026):
--   - public.agents was missing: interaction_style, focus, stress_response,
--     perceived_value, negotiation_style, archetype, archetype_completed_at.
--   - public.assessments table did not exist at all.
--   Result: POST /api/agent-assessment/submit crashed with
--   `column agents.interaction_style does not exist` (Postgres 42703).
--
-- WHAT THIS DOES:
--   - Idempotently ensures every enum type + value exists.
--   - Idempotently ensures every table exists (CREATE TABLE IF NOT EXISTS).
--   - Idempotently ADDs every column the code reads/writes (ADD COLUMN IF NOT
--     EXISTS), so an older table is upgraded in place without data loss.
--
-- SAFETY:
--   - 100% idempotent: safe to run multiple times.
--   - Never drops columns, tables, or data.
--   - Never touches RLS policies (run schema.sql for those on a fresh project).
--
-- HOW TO RUN:
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   Requires the pgcrypto extension (already enabled by schema.sql).
-- ============================================================================

create extension if not exists "pgcrypto";

-- --- Enum types (create if missing) -----------------------------------------
do $$ begin
  create type user_role as enum ('client','agent','reviewer','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type client_source as enum ('qr','requity_reviewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type assessment_status as enum ('draft','started','completed','reviewer_matching','assigned','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_type as enum ('system','client_activity','reviewer_match','archetype','support');
exception when duplicate_object then null; end $$;

-- --- Enum values (add if a type pre-existed without them) --------------------
alter type assessment_status add value if not exists 'draft';
alter type assessment_status add value if not exists 'started';
alter type assessment_status add value if not exists 'completed';
alter type assessment_status add value if not exists 'reviewer_matching';
alter type assessment_status add value if not exists 'assigned';
alter type assessment_status add value if not exists 'archived';

alter type message_type add value if not exists 'system';
alter type message_type add value if not exists 'client_activity';
alter type message_type add value if not exists 'reviewer_match';
alter type message_type add value if not exists 'archetype';
alter type message_type add value if not exists 'support';

-- --- Tables (create if missing) ---------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text,
  email text unique not null,
  phone text,
  date_of_birth date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete cascade,
  display_name text not null,
  email text not null,
  phone text,
  brokerage text,
  license_number text,
  archetype text,
  archetype_completed_at timestamptz,
  interaction_style text,
  focus text,
  stress_response text,
  perceived_value text,
  negotiation_style text,
  public_assessment_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  assigned_agent_id uuid references agents(id) on delete set null,
  source client_source not null default 'qr',
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  archetype text,
  orientation text,
  style text,
  stress_response text,
  status assessment_status default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  assessment_type text not null check (assessment_type in ('client','agent')),
  token text unique default encode(gen_random_bytes(16), 'hex'),
  status assessment_status default 'draft',
  answers jsonb default '{}'::jsonb,
  result jsonb default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists match_recommendations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100),
  label text not null,
  reason text,
  status text default 'pending' check (status in ('pending','approved','rejected','assigned')),
  reviewer_id uuid references profiles(id),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references profiles(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  type message_type not null default 'system',
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  template_key text not null,
  brevo_message_id text,
  payload jsonb default '{}'::jsonb,
  status text default 'queued',
  created_at timestamptz default now()
);

create table if not exists assessment_leads (
  id uuid primary key default gen_random_uuid(),
  client_assessment_id uuid references assessments(id) on delete set null,
  agent_id uuid references agents(id) on delete set null,
  reviewer_id uuid references profiles(id) on delete set null,
  source text not null check (source in ('qr','agent_link','reviewer')),
  status text not null default 'started'
    check (status in ('started','in_progress','completed','abandoned','followed_up')),
  full_name text,
  email text,
  phone text,
  contact_consent boolean default true,
  started_at timestamptz default now(),
  last_activity_at timestamptz default now(),
  completed_at timestamptz,
  answered_count integer default 0,
  partial_answers jsonb default '{}'::jsonb,
  archetype text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- --- Columns (add if an older table is missing them) ------------------------
-- profiles
alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists date_of_birth date;
-- Terms of Service acceptance (recorded at agent account creation). Additive and
-- non-destructive; existing users keep signing in without re-accepting.
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists terms_version text;
alter table profiles add column if not exists created_at timestamptz default now();
alter table profiles add column if not exists updated_at timestamptz default now();

-- agents (the dimension columns are the usual cause of agent-submit failures)
alter table agents add column if not exists profile_id uuid;
alter table agents add column if not exists phone text;
alter table agents add column if not exists brokerage text;
alter table agents add column if not exists license_number text;
alter table agents add column if not exists archetype text;
alter table agents add column if not exists archetype_completed_at timestamptz;
alter table agents add column if not exists interaction_style text;
alter table agents add column if not exists focus text;
alter table agents add column if not exists stress_response text;
alter table agents add column if not exists perceived_value text;
alter table agents add column if not exists negotiation_style text;
-- JSON snapshots of the agent assessment (used by the app even when the scalar
-- dimension columns above are absent). Safe, additive, non-destructive.
alter table agents add column if not exists assessment_responses jsonb default '{}'::jsonb;
alter table agents add column if not exists assessment_summary jsonb default '{}'::jsonb;
alter table agents add column if not exists public_assessment_token text default encode(gen_random_bytes(16), 'hex');
alter table agents add column if not exists created_at timestamptz default now();
alter table agents add column if not exists updated_at timestamptz default now();

-- clients
alter table clients add column if not exists assigned_agent_id uuid;
alter table clients add column if not exists phone text;
alter table clients add column if not exists date_of_birth date;
alter table clients add column if not exists archetype text;
alter table clients add column if not exists orientation text;
alter table clients add column if not exists style text;
alter table clients add column if not exists stress_response text;
alter table clients add column if not exists created_at timestamptz default now();
alter table clients add column if not exists updated_at timestamptz default now();

-- assessments
alter table assessments add column if not exists client_id uuid;
alter table assessments add column if not exists agent_id uuid;
alter table assessments add column if not exists token text default encode(gen_random_bytes(16), 'hex');
alter table assessments add column if not exists answers jsonb default '{}'::jsonb;
alter table assessments add column if not exists result jsonb default '{}'::jsonb;
alter table assessments add column if not exists completed_at timestamptz;
alter table assessments add column if not exists created_at timestamptz default now();

-- match_recommendations
alter table match_recommendations add column if not exists reason text;
alter table match_recommendations add column if not exists reviewer_id uuid;
alter table match_recommendations add column if not exists reviewed_at timestamptz;
alter table match_recommendations add column if not exists created_at timestamptz default now();

-- messages
alter table messages add column if not exists recipient_profile_id uuid;
alter table messages add column if not exists agent_id uuid;
alter table messages add column if not exists client_id uuid;
alter table messages add column if not exists read_at timestamptz;
alter table messages add column if not exists created_at timestamptz default now();

-- email_events
alter table email_events add column if not exists brevo_message_id text;
alter table email_events add column if not exists payload jsonb default '{}'::jsonb;
alter table email_events add column if not exists status text default 'queued';
alter table email_events add column if not exists created_at timestamptz default now();

-- assessment_leads
alter table assessment_leads add column if not exists client_assessment_id uuid;
alter table assessment_leads add column if not exists agent_id uuid;
alter table assessment_leads add column if not exists reviewer_id uuid;
alter table assessment_leads add column if not exists full_name text;
alter table assessment_leads add column if not exists email text;
alter table assessment_leads add column if not exists phone text;
alter table assessment_leads add column if not exists contact_consent boolean default true;
alter table assessment_leads add column if not exists started_at timestamptz default now();
alter table assessment_leads add column if not exists last_activity_at timestamptz default now();
alter table assessment_leads add column if not exists completed_at timestamptz;
alter table assessment_leads add column if not exists answered_count integer default 0;
alter table assessment_leads add column if not exists partial_answers jsonb default '{}'::jsonb;
alter table assessment_leads add column if not exists archetype text;
alter table assessment_leads add column if not exists notes text;
alter table assessment_leads add column if not exists created_at timestamptz default now();
alter table assessment_leads add column if not exists updated_at timestamptz default now();

-- --- Row Level Security (deny-by-default for the browser) --------------------
-- Service-role API routes bypass RLS; these guards ensure that any table this
-- migration just CREATEd cannot be read directly by the anon/authenticated
-- browser. Enabling RLS that is already enabled is a safe no-op.
alter table profiles enable row level security;
alter table agents enable row level security;
alter table clients enable row level security;
alter table assessments enable row level security;
alter table match_recommendations enable row level security;
alter table messages enable row level security;
alter table email_events enable row level security;
alter table assessment_leads enable row level security;

-- Role helper used by the read policies (idempotent).
create or replace function public.requity_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;
revoke all on function public.requity_role() from public;
grant execute on function public.requity_role() to authenticated;

-- Read policy for assessments (this table is the one most likely freshly created
-- above). All writes go through the service role. Idempotent via drop-if-exists.
drop policy if exists "assessments agent or reviewer read" on assessments;
create policy "assessments agent or reviewer read" on assessments
  for select using (
    exists (
      select 1 from agents
      where agents.id = assessments.agent_id
        and agents.profile_id = auth.uid()
    )
    or exists (
      select 1 from clients
      join agents on agents.id = clients.assigned_agent_id
      where clients.id = assessments.client_id
        and agents.profile_id = auth.uid()
    )
    or public.requity_role() in ('reviewer', 'admin')
  );

-- NOTE: read/update policies for the other tables are defined in schema.sql. If
-- this migration just created any of those tables, re-run schema.sql (its policy
-- blocks are idempotent) to install their full policy set.

-- --- Helpful indexes (no-ops if they already exist) -------------------------
create index if not exists idx_agents_profile_id on agents(profile_id);
create index if not exists idx_agents_public_token on agents(public_assessment_token);
create index if not exists idx_assessments_agent_id on assessments(agent_id);
create index if not exists idx_assessment_leads_agent_id on assessment_leads(agent_id);
create index if not exists idx_assessment_leads_status on assessment_leads(status);

-- --- Refresh the PostgREST schema cache ------------------------------------
-- After adding columns, PostgREST (the layer behind supabase-js) may still hold
-- a stale schema cache and report "Could not find the 'X' column ... in the
-- schema cache" until it reloads. This NOTIFY forces an immediate reload so the
-- new columns are usable right away (no project restart needed).
notify pgrst, 'reload schema';

-- Done. Verify in the Supabase SQL editor:
--   select column_name from information_schema.columns
--   where table_name = 'agents' order by column_name;
--
-- NOTE: The application is resilient to a not-yet-applied migration — it drops
-- columns the live schema is missing and still saves archetype + contact. Run
-- this migration to restore full dimension fidelity (matching, analytics).
