-- ============================================================================
-- REQUITY migration 0011. Match lanes (buying/selling/both/general) and
-- reviewer soft-delete (archive) columns.
--
-- WHY THIS EXISTS:
--   1) Clients who are BOTH buying and selling may need TWO active matches:
--      one buying-side agent and one selling-side agent (or one combined
--      "both" match when the same agent covers both sides). Migration 0010
--      enforced ONE active match per client, which made a both-client
--      disappear from reviewer views after the first side was matched. This
--      migration adds a match_lane column and re-scopes the uniqueness to
--      client + lane (and lead + lane) instead of client alone.
--   2) Reviewers can now archive (soft delete) agents, paired clients, and
--      up-for-review clients. Archived records are hidden from active
--      reviewer views but never physically deleted: match history,
--      email_events, and assessment answers are always kept.
--
-- SAFETY:
--   - Idempotent (IF NOT EXISTS / IF EXISTS everywhere).
--   - Never drops data. Only adds columns, swaps indexes, and backfills.
--   - De-duplicates any multiple-active rows per client/lead + lane BEFORE
--     creating the new unique indexes so the migration cannot fail.
--   - Agents remain intentionally UNCONSTRAINED: an agent can hold unlimited
--     active matches across clients.
-- ============================================================================

-- --- 1) Match lane -----------------------------------------------------------
alter table public.match_recommendations
  add column if not exists match_lane text default 'general';

-- Backfill: rows written before this migration have no lane. Default them to
-- 'general' so existing single-match behavior is preserved exactly.
update public.match_recommendations
set match_lane = 'general'
where match_lane is null;

-- Allowed lanes only.
alter table public.match_recommendations
  drop constraint if exists match_recommendations_match_lane_check;
alter table public.match_recommendations
  add constraint match_recommendations_match_lane_check
  check (match_lane in ('buying', 'selling', 'both', 'general'));

-- --- 2) Replace the single-active-per-client indexes with lane-scoped ones ---
drop index if exists one_active_match_per_client_idx;
drop index if exists one_active_match_per_lead_idx;

-- Cleanup duplicate active matches per client + lane (keep newest) BEFORE the
-- unique indexes so legacy data can never fail the migration.
with ranked as (
  select
    id,
    row_number() over (
      partition by client_id, match_lane
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
      partition by lead_id, match_lane
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

-- One active match per client + lane. Agents are intentionally NOT constrained
-- (no unique index on agent_id) so an agent can be matched to unlimited clients.
create unique index if not exists one_active_match_per_client_lane_idx
  on public.match_recommendations(client_id, match_lane)
  where status = 'active' and client_id is not null;

-- One active match per reviewer lead + lane (leads with no clients row yet).
create unique index if not exists one_active_match_per_lead_lane_idx
  on public.match_recommendations(lead_id, match_lane)
  where status = 'active' and lead_id is not null;

-- --- 3) Reviewer soft-delete (archive) columns -------------------------------
-- archived_at is the default soft-delete mechanism. deleted_at exists for a
-- future harder removal but the application only ever sets archived_at.
alter table public.agents add column if not exists archived_at timestamptz;
alter table public.agents add column if not exists deleted_at timestamptz;
alter table public.clients add column if not exists archived_at timestamptz;
alter table public.clients add column if not exists deleted_at timestamptz;
alter table public.assessment_leads add column if not exists archived_at timestamptz;
alter table public.assessment_leads add column if not exists deleted_at timestamptz;

create index if not exists idx_agents_archived_at on public.agents(archived_at);
create index if not exists idx_clients_archived_at on public.clients(archived_at);
create index if not exists idx_assessment_leads_archived_at on public.assessment_leads(archived_at);

notify pgrst, 'reload schema';
