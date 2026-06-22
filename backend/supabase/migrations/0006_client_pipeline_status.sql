-- ============================================================================
-- REQUITY migration 0006 — agent-controlled client pipeline status.
--
-- WHY THIS EXISTS:
--   The agent dashboard "Client Assessments" cards now expose a status dropdown
--   the agent controls: Potential / Active / Under Contract / Closed. We store
--   the agent's explicit choice in a dedicated `pipeline_status` column so it is
--   never confused with:
--     - clients.status     (assessment lifecycle: draft/started/completed/...)
--     - clients.deal_status(legacy closings flag: active/closing/closed)
--   When pipeline_status is NULL the dashboard DERIVES a sensible status from the
--   existing lifecycle/deal columns (see derivePipelineStatus in dashboard.ts),
--   so legacy rows keep working with no backfill required.
--
-- VALUES (text, no enum so it tolerates schema drift):
--   'potential' | 'active' | 'under_contract' | 'closed'
--   NULL = derive from lifecycle/deal_status.
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN IF NOT EXISTS). Never drops columns/data.
--   - Nullable, no default: existing rows are untouched and keep deriving.
-- ============================================================================

alter table public.clients add column if not exists pipeline_status text;
alter table public.assessment_leads add column if not exists pipeline_status text;

-- Tell PostgREST (Supabase REST) to reload its schema cache immediately.
notify pgrst, 'reload schema';
