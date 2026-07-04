-- ============================================================================
-- REQUITY migration 0010. Match lifecycle: one active match per client, agents
-- reusable without limit.
--
-- WHY THIS EXISTS:
--   A reviewer can match the same agent to unlimited clients, but each client
--   (or reviewer lead) may only have ONE active match at a time. This adds a
--   lifecycle status to match_recommendations, a lead_id (leads that never
--   became a clients row can still be matched), and partial unique indexes that
--   enforce single-active-per-client and single-active-per-lead at the DB level.
--   Agents are intentionally NOT constrained (no unique index on agent_id).
--
-- SAFETY:
--   - Idempotent (IF NOT EXISTS / IF EXISTS everywhere).
--   - Widens the status CHECK constraint before writing new statuses.
--   - De-duplicates any pre-existing multiple-active rows (keeps newest) BEFORE
--     creating the unique indexes so the migration cannot fail on legacy data.
-- ============================================================================

-- --- Lifecycle columns ------------------------------------------------------
alter table public.match_recommendations add column if not exists status text default 'suggested';
alter table public.match_recommendations add column if not exists lead_id uuid;
alter table public.match_recommendations add column if not exists is_selected boolean default false;
alter table public.match_recommendations add column if not exists finalized_at timestamptz;
alter table public.match_recommendations add column if not exists superseded_at timestamptz;
alter table public.match_recommendations add column if not exists superseded_by uuid;
alter table public.match_recommendations add column if not exists reviewer_notes text;
alter table public.match_recommendations add column if not exists updated_at timestamptz default now();

-- --- Widen the status CHECK to the full lifecycle ---------------------------
-- The original inline constraint only allowed pending/approved/rejected/assigned.
alter table public.match_recommendations drop constraint if exists match_recommendations_status_check;
alter table public.match_recommendations
  add constraint match_recommendations_status_check
  check (status in (
    'pending','approved','rejected','assigned',
    'suggested','pending_review','active','superseded','declined','archived','closed'
  ));

-- --- Backfill statuses -------------------------------------------------------
-- Any row that was a real pairing (assigned/approved, or explicitly selected)
-- becomes the current active match; everything else defaults to suggested.
update public.match_recommendations
set status = 'active',
    finalized_at = coalesce(finalized_at, reviewed_at, created_at),
    updated_at = now()
where status in ('assigned','approved');

update public.match_recommendations
set status = 'active',
    finalized_at = coalesce(finalized_at, reviewed_at, created_at),
    updated_at = now()
where status is null
  and coalesce(is_selected, false) = true;

update public.match_recommendations
set status = 'suggested'
where status is null;

-- --- Cleanup duplicate active matches BEFORE the unique indexes -------------
-- Keep the newest active row per client; supersede the rest.
with ranked as (
  select
    id,
    row_number() over (
      partition by client_id
      order by finalized_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.match_recommendations
  where status = 'active'
    and client_id is not null
)
update public.match_recommendations m
set status = 'superseded',
    superseded_at = now(),
    updated_at = now()
from ranked r
where m.id = r.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by lead_id
      order by finalized_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.match_recommendations
  where status = 'active'
    and lead_id is not null
)
update public.match_recommendations m
set status = 'superseded',
    superseded_at = now(),
    updated_at = now()
from ranked r
where m.id = r.id
  and r.rn > 1;

-- --- Indexes ----------------------------------------------------------------
create index if not exists match_recommendations_agent_id_idx
  on public.match_recommendations(agent_id);
create index if not exists match_recommendations_client_id_status_idx
  on public.match_recommendations(client_id, status);
create index if not exists match_recommendations_lead_id_status_idx
  on public.match_recommendations(lead_id, status);

-- One active match per client (agents are intentionally NOT constrained).
create unique index if not exists one_active_match_per_client_idx
  on public.match_recommendations(client_id)
  where status = 'active' and client_id is not null;

-- One active match per reviewer lead (for leads with no clients row yet).
create unique index if not exists one_active_match_per_lead_idx
  on public.match_recommendations(lead_id)
  where status = 'active' and lead_id is not null;

-- Keep updated_at fresh on change (reuses the shared trigger function).
drop trigger if exists trg_match_recs_updated_at on public.match_recommendations;
create trigger trg_match_recs_updated_at
  before update on public.match_recommendations
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
