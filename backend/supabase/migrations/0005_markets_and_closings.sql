-- ============================================================================
-- REQUITY migration 0005 — agent-auth column guards, buy/sell markets, closings.
--
-- WHY THIS EXISTS:
--   1. AUTH RESILIENCE: guarantee the columns the agent auth/profile/agent flow
--      reads actually exist on a drifted live DB, so /api/auth/me never 500s and
--      bounces a signed-in agent back to the login page.
--   2. BUY/SELL MARKETS: clients can buy, sell, or do both — store the buying and
--      selling market separately (keeping market_city as a combined summary).
--   3. CLOSINGS: add safe status-based closing support for the agent dashboard.
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN IF NOT EXISTS). Never drops columns/data.
-- ============================================================================

-- 1) Auth flow required columns (no-ops when already present) -----------------
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role user_role;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.agents add column if not exists profile_id uuid;
alter table public.agents add column if not exists email text;
alter table public.agents add column if not exists display_name text;
alter table public.agents add column if not exists archetype text;
alter table public.agents add column if not exists archetype_completed_at timestamptz;
alter table public.agents add column if not exists market_city text;
alter table public.agents add column if not exists public_assessment_token text
  default encode(gen_random_bytes(16), 'hex');
alter table public.agents add column if not exists created_at timestamptz default now();
alter table public.agents add column if not exists updated_at timestamptz default now();

-- 2) Buying / selling markets -------------------------------------------------
alter table public.assessment_leads add column if not exists buying_market_city text;
alter table public.assessment_leads add column if not exists selling_market_city text;

alter table public.clients add column if not exists buying_market_city text;
alter table public.clients add column if not exists selling_market_city text;

alter table public.assessments add column if not exists buying_market_city text;
alter table public.assessments add column if not exists selling_market_city text;

-- 3) Closings (status-based) --------------------------------------------------
-- deal_status: 'active' (default) | 'closing' | 'closed'. close_date is set when
-- a deal is marked closing/closed. The dashboard reads these defensively and
-- shows a clean "No closings yet." empty state until they are populated.
alter table public.clients add column if not exists deal_status text default 'active';
alter table public.clients add column if not exists close_date date;

-- Tell PostgREST (Supabase REST) to reload its schema cache immediately.
notify pgrst, 'reload schema';
