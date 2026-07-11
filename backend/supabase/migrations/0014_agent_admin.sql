-- 0014_agent_admin.sql
-- Reviewer Agent Control Center support (additive, idempotent).
--
-- Adds three columns to public.agents:
--   needs_assessment_update      Reviewer-only flag. When true the agent sees a
--                                banner in their dashboard asking them to update
--                                their REQUITY assessment. Cleared automatically
--                                when the agent submits a new assessment.
--   assessment_update_requested_at  When the reviewer last requested the update.
--   reviewer_notes               Free-form internal notes kept by reviewers.
--
-- Only reviewers/admins can set needs_assessment_update (enforced by the
-- reviewer-only API route; agents cannot write these columns through any
-- public route). Nothing here removes or rewrites existing data.

alter table public.agents
  add column if not exists needs_assessment_update boolean not null default false;

alter table public.agents
  add column if not exists assessment_update_requested_at timestamptz;

alter table public.agents
  add column if not exists reviewer_notes text;

create index if not exists idx_agents_needs_assessment_update
  on public.agents(needs_assessment_update)
  where needs_assessment_update = true;

notify pgrst, 'reload schema';
