-- REQUITY clean Supabase schema scaffold
-- Enable in Supabase SQL editor before wiring the frontend.
create extension if not exists "pgcrypto";

create type user_role as enum ('client','agent','reviewer','admin');
create type client_source as enum ('qr','requity_reviewer');
create type assessment_status as enum ('draft','started','completed','reviewer_matching','assigned','archived');
create type message_type as enum ('system','client_activity','reviewer_match','archetype','support');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text,
  email text unique not null,
  phone text,
  date_of_birth date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  display_name text not null,
  email text not null,
  phone text,
  archetype text,
  interaction_style text,
  focus text,
  stress_response text,
  perceived_value text,
  negotiation_style text,
  public_assessment_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

create table clients (
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

create table assessments (
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

create table match_recommendations (
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

create table messages (
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

create table email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  template_key text not null,
  brevo_message_id text,
  payload jsonb default '{}'::jsonb,
  status text default 'queued',
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table agents enable row level security;
alter table clients enable row level security;
alter table assessments enable row level security;
alter table match_recommendations enable row level security;
alter table messages enable row level security;
alter table email_events enable row level security;

-- Minimal RLS starters. Tighten before production.
create policy "profiles self read" on profiles for select using (auth.uid() = id);
create policy "profiles self update" on profiles for update using (auth.uid() = id);
create policy "agents owner read" on agents for select using (profile_id = auth.uid());
create policy "clients assigned agent read" on clients for select using (
  exists (select 1 from agents where agents.id = clients.assigned_agent_id and agents.profile_id = auth.uid())
);
create policy "messages recipient read" on messages for select using (recipient_profile_id = auth.uid());
