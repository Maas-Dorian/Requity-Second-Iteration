-- ============================================================================
-- REQUITY Supabase schema
--
-- INTENDED FOR A FRESH SUPABASE PROJECT. Run once in the Supabase SQL Editor
-- (Dashboard → SQL Editor → paste → Run) before wiring the frontend.
--
-- RE-RUN SAFETY:
--   - Extensions, enum types, tables, indexes, policies, and triggers are all
--     guarded (IF NOT EXISTS / DO-block / DROP ... IF EXISTS), so re-running this
--     whole file on the SAME project will NOT error and will NOT create duplicate
--     policies/triggers/indexes.
--   - IMPORTANT: guards mean an EXISTING table is left as-is. If you previously
--     ran an older version of this schema, new COLUMNS are NOT auto-added by a
--     re-run. To upgrade either (a) start a fresh Supabase project, or (b) apply
--     the missing columns manually with ALTER TABLE. The safest path for a clean
--     slate is Supabase → Settings → General → reset, or drop the public tables.
--
-- REQUIRED EXTENSIONS:
--   - pgcrypto — provides gen_random_uuid() and gen_random_bytes() used below.
-- ============================================================================
create extension if not exists "pgcrypto";

-- Enum types (idempotent: skip if the type already exists).
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

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text,
  email text unique not null,
  phone text,
  date_of_birth date,
  -- Terms of Service acceptance captured at agent account creation.
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One agent row per auth user (profile_id is unique). `display_name` holds the
-- agent's full name and `public_assessment_token` is the shareable QR/link token
-- (exposed by the API as `publicToken`).
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
  -- JSON snapshots of the agent assessment (answers + resolved dimensions).
  assessment_responses jsonb default '{}'::jsonb,
  assessment_summary jsonb default '{}'::jsonb,
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

-- Incomplete / partial assessment lead capture.
-- A lead is created as soon as a client enters their contact info and starts the
-- assessment, so REQUITY can follow up even if the assessment is never finished.
-- Completed assessments convert the same lead to status='completed'.
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

alter table profiles enable row level security;
alter table agents enable row level security;
alter table clients enable row level security;
alter table assessments enable row level security;
alter table match_recommendations enable row level security;
alter table messages enable row level security;
alter table email_events enable row level security;
alter table assessment_leads enable row level security;

-- ============================================================================
-- Row Level Security (production)
--
-- The Supabase SERVICE ROLE key (used only by server-side API routes in /api)
-- BYPASSES RLS entirely. These policies therefore govern only browser/anon/
-- authenticated access. Public assessment submission does NOT write tables from
-- the browser — all inserts/updates go through the service-role API routes.
--
-- Design: SELECT policies are granted narrowly per role. No INSERT/UPDATE/DELETE
-- policies are created for anon/authenticated, so with RLS enabled those writes
-- are denied by default (deny-by-default for the browser).
-- ============================================================================

-- Helper: role of the current authenticated user. SECURITY DEFINER so it can
-- read `profiles` without triggering recursive RLS checks on `profiles` itself.
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

-- Idempotent: drop earlier starter policies if present.
drop policy if exists "profiles self read" on profiles;
drop policy if exists "profiles self update" on profiles;
drop policy if exists "agents owner read" on agents;
drop policy if exists "agents self read" on agents;
drop policy if exists "agents self update" on agents;
drop policy if exists "clients assigned agent read" on clients;
drop policy if exists "clients agent or reviewer read" on clients;
drop policy if exists "assessments agent or reviewer read" on assessments;
drop policy if exists "match recs agent or reviewer read" on match_recommendations;
drop policy if exists "messages recipient read" on messages;
drop policy if exists "email events admin read" on email_events;

-- profiles: a user can read and update ONLY their own profile row.
create policy "profiles self read" on profiles
  for select using (auth.uid() = id);
create policy "profiles self update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- agents: an agent can read/update ONLY their own agent row.
-- Reviewers/admins can read all agents (needed to rank and approve matches).
create policy "agents self read" on agents
  for select using (
    profile_id = auth.uid() or public.requity_role() in ('reviewer', 'admin')
  );
create policy "agents self update" on agents
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- clients: an agent can read ONLY clients assigned to them.
-- Reviewers/admins can read all clients (the reviewer queue).
create policy "clients agent or reviewer read" on clients
  for select using (
    exists (
      select 1 from agents
      where agents.id = clients.assigned_agent_id
        and agents.profile_id = auth.uid()
    )
    or public.requity_role() in ('reviewer', 'admin')
  );

-- assessments: readable by the owning agent (their own agent assessment or an
-- assessment for one of their clients) and by reviewers/admins. No browser writes.
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

-- match_recommendations: the recommended agent can read theirs; reviewers/admins
-- can read all. Approvals are performed by service-role API routes only.
create policy "match recs agent or reviewer read" on match_recommendations
  for select using (
    exists (
      select 1 from agents
      where agents.id = match_recommendations.agent_id
        and agents.profile_id = auth.uid()
    )
    or public.requity_role() in ('reviewer', 'admin')
  );

-- messages: an agent can read notifications addressed to their profile or their
-- agent row. No blanket access for other roles.
create policy "messages recipient read" on messages
  for select using (
    recipient_profile_id = auth.uid()
    or exists (
      select 1 from agents
      where agents.id = messages.agent_id
        and agents.profile_id = auth.uid()
    )
  );

-- email_events: sensitive delivery log. Admins only via the browser; everything
-- else goes through the service role.
create policy "email events admin read" on email_events
  for select using (public.requity_role() = 'admin');

-- assessment_leads: incomplete/partial lead capture. No anon/public writes — the
-- service-role API performs all inserts/updates. Drop-if-exists keeps it idempotent.
drop policy if exists "assessment_leads reviewer read" on assessment_leads;
drop policy if exists "assessment_leads agent read" on assessment_leads;
drop policy if exists "assessment_leads reviewer update" on assessment_leads;

-- Reviewers/admins can read all leads (the Incomplete Assessments queue).
create policy "assessment_leads reviewer read" on assessment_leads
  for select using (public.requity_role() in ('reviewer', 'admin'));

-- Agents can read only their own qr/agent_link leads (never reviewer-only leads
-- unless they are the attached agent).
create policy "assessment_leads agent read" on assessment_leads
  for select using (
    source in ('qr', 'agent_link')
    and exists (
      select 1 from agents
      where agents.id = assessment_leads.agent_id
        and agents.profile_id = auth.uid()
    )
  );

-- Only reviewers/admins may update follow-up status/notes from the browser.
create policy "assessment_leads reviewer update" on assessment_leads
  for update using (public.requity_role() in ('reviewer', 'admin'))
  with check (public.requity_role() in ('reviewer', 'admin'));

-- Helpful indexes for common lookups.
create index if not exists idx_profiles_email on profiles(email);
create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_agents_profile_id on agents(profile_id);
create index if not exists idx_agents_public_token on agents(public_assessment_token);
create index if not exists idx_clients_assigned_agent on clients(assigned_agent_id);
create index if not exists idx_clients_source on clients(source);
create index if not exists idx_clients_status on clients(status);
create index if not exists idx_assessments_client_id on assessments(client_id);
create index if not exists idx_assessments_agent_id on assessments(agent_id);
create index if not exists idx_assessments_token on assessments(token);
create index if not exists idx_match_recs_client_id on match_recommendations(client_id);
create index if not exists idx_match_recs_agent_id on match_recommendations(agent_id);
create index if not exists idx_match_recs_status on match_recommendations(status);
create index if not exists idx_messages_recipient on messages(recipient_profile_id);
create index if not exists idx_messages_agent_id on messages(agent_id);
create index if not exists idx_email_events_recipient on email_events(recipient_email);
create index if not exists idx_assessment_leads_status on assessment_leads(status);
create index if not exists idx_assessment_leads_source on assessment_leads(source);
create index if not exists idx_assessment_leads_agent_id on assessment_leads(agent_id);
create index if not exists idx_assessment_leads_reviewer_id on assessment_leads(reviewer_id);
create index if not exists idx_assessment_leads_email on assessment_leads(email);
create index if not exists idx_assessment_leads_last_activity on assessment_leads(last_activity_at desc);

-- Keep updated_at columns fresh on row changes.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers (drop-if-exists keeps re-runs from creating duplicate triggers).
drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_clients_updated_at on clients;
create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

drop trigger if exists trg_assessment_leads_updated_at on assessment_leads;
create trigger trg_assessment_leads_updated_at
  before update on assessment_leads
  for each row execute function set_updated_at();

drop trigger if exists trg_agents_updated_at on agents;
create trigger trg_agents_updated_at
  before update on agents
  for each row execute function set_updated_at();
