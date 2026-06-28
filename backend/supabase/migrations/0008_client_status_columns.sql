-- ============================================================================
-- REQUITY migration 0008 — ensure reviewer-editable client status columns.
--
-- WHY THIS EXISTS:
--   The reviewer page can now SEE and SET a client's pipeline status
--   (Potential / Active / Under Contract / Closed) for matched/paired clients.
--   The reviewer status update writes the agent-facing `pipeline_status` column
--   (added in 0006) and keeps the legacy lifecycle `status` coherent. Lead-only
--   rows (no clients row yet) store the status on assessment_leads.pipeline_status.
--
--   This migration only GUARANTEES the columns exist so the update endpoint is
--   safe on every environment. The agent dashboard (0006) and reviewer page share
--   the same `pipeline_status` field, so a reviewer change is reflected on the
--   agent dashboard after refresh and vice versa.
--
-- VALUES (text, no enum so it tolerates schema drift):
--   'potential' | 'active' | 'under_contract' | 'closed'
--   NULL on clients/leads = derive from the lifecycle/deal columns.
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN IF NOT EXISTS). Never drops columns or data.
--   - If 0006 already added pipeline_status, these statements are no-ops.
-- ============================================================================

alter table public.clients add column if not exists status text;
alter table public.clients add column if not exists pipeline_status text;

alter table public.assessment_leads add column if not exists status text;
alter table public.assessment_leads add column if not exists pipeline_status text;

-- Tell PostgREST (Supabase REST) to reload its schema cache immediately.
notify pgrst, 'reload schema';
