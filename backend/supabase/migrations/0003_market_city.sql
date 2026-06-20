-- ============================================================================
-- REQUITY migration 0003 — add city/market to agents and client assessments.
--
-- WHY THIS EXISTS:
--   Both assessments now capture a city/market:
--     - Agents answer "What city or market do you primarily work in?"
--     - Clients answer "What city or market are you looking to buy or sell in?"
--   The agent dashboard, reviewer queue, client cards, and completion email
--   surface this value. These columns store it durably alongside the rest of
--   the submission. It is metadata only and never affects archetype scoring.
--
-- WHAT THIS DOES:
--   - Idempotently ADDs a `market_city text` column to:
--       agents            : the city/market the agent works in
--       assessment_leads  : the city/market the client is buying/selling in
--       clients           : same, mirrored for the enrichment table
--       assessments       : same, mirrored on the assessment row
--
-- SAFETY:
--   - 100% idempotent: safe to run multiple times (ADD COLUMN IF NOT EXISTS).
--   - Never drops columns, tables, or data.
--   - Old rows simply have NULLs (the app renders "Not specified" for those).
-- ============================================================================

alter table public.agents add column if not exists market_city text;

alter table public.assessment_leads add column if not exists market_city text;

alter table public.clients add column if not exists market_city text;

alter table public.assessments add column if not exists market_city text;

-- Tell PostgREST (Supabase REST) to reload its schema cache so the new columns
-- are immediately usable by the service-role writes.
notify pgrst, 'reload schema';
