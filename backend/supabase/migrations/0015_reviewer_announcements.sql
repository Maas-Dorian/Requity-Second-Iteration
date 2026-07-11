-- 0015_reviewer_announcements.sql
--
-- Reviewer-managed Updates and Announcements (agent-facing, never public).
--
-- Reviewers create announcements from the reviewer dashboard Updates tab.
-- Agents see active, targeted announcements as a banner after login. Nothing
-- here is readable publicly: all access goes through the service-role API,
-- which enforces reviewer/admin auth for management and agent auth for reads.
--
-- Additive and idempotent. Safe to run on a live database.

-- --- Tables -----------------------------------------------------------------

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

-- --- Check constraints (guarded so re-runs never fail) -----------------------

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

-- --- Indexes ------------------------------------------------------------------

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

-- --- RLS ----------------------------------------------------------------------
-- No policies on purpose: only the server-side service role (which bypasses
-- RLS) may read or write. Reviewer/admin and agent access is enforced in the
-- API routes. There is no public or unauthenticated read path.

alter table public.reviewer_announcements enable row level security;
alter table public.reviewer_announcement_targets enable row level security;
alter table public.reviewer_announcement_dismissals enable row level security;
