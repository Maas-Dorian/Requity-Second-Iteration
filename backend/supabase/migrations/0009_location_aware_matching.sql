-- ============================================================================
-- REQUITY migration 0009 — location-aware, proximity-based matching.
--
-- WHY THIS EXISTS:
--   Deals should happen within each agent's service area. This migration adds
--   structured location fields so the backend can group people by market and add
--   proximity to the match formula. All columns are nullable / defaulted so the
--   existing single market_city / buying_market_city / selling_market_city fields
--   keep working unchanged (no data loss, no required backfill).
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS).
--   - Geocoding is cached server-side in public.location_cache; coordinates are
--     optional — matching falls back to city/state text when they are missing.
-- ============================================================================

-- --- Agents: structured market + service area -------------------------------
alter table public.agents add column if not exists market_state text;
alter table public.agents add column if not exists market_country text default 'US';
alter table public.agents add column if not exists service_radius_miles integer default 50;
alter table public.agents add column if not exists latitude double precision;
alter table public.agents add column if not exists longitude double precision;
alter table public.agents add column if not exists location_normalized text;
alter table public.agents add column if not exists location_place_id text;
alter table public.agents add column if not exists service_areas jsonb default '[]'::jsonb;

-- --- Assessment leads: structured buying/selling/fallback location ----------
alter table public.assessment_leads add column if not exists buying_market_state text;
alter table public.assessment_leads add column if not exists buying_latitude double precision;
alter table public.assessment_leads add column if not exists buying_longitude double precision;
alter table public.assessment_leads add column if not exists selling_market_state text;
alter table public.assessment_leads add column if not exists selling_latitude double precision;
alter table public.assessment_leads add column if not exists selling_longitude double precision;
alter table public.assessment_leads add column if not exists market_state text;
alter table public.assessment_leads add column if not exists latitude double precision;
alter table public.assessment_leads add column if not exists longitude double precision;
alter table public.assessment_leads add column if not exists location_normalized text;

-- --- Clients: structured buying/selling/fallback location -------------------
alter table public.clients add column if not exists buying_market_state text;
alter table public.clients add column if not exists buying_latitude double precision;
alter table public.clients add column if not exists buying_longitude double precision;
alter table public.clients add column if not exists selling_market_state text;
alter table public.clients add column if not exists selling_latitude double precision;
alter table public.clients add column if not exists selling_longitude double precision;
alter table public.clients add column if not exists market_state text;
alter table public.clients add column if not exists latitude double precision;
alter table public.clients add column if not exists longitude double precision;
alter table public.clients add column if not exists location_normalized text;

-- --- Match recommendations: store the location component of each match -------
alter table public.match_recommendations add column if not exists location_score integer;
alter table public.match_recommendations add column if not exists distance_miles double precision;
alter table public.match_recommendations add column if not exists match_reason text;

-- --- Server-side geocode cache (never shipped to the browser) ---------------
create table if not exists public.location_cache (
  id uuid primary key default gen_random_uuid(),
  normalized text unique not null,
  city text,
  state text,
  country text default 'US',
  latitude double precision,
  longitude double precision,
  provider text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists location_cache_normalized_idx on public.location_cache(normalized);
create index if not exists agents_location_normalized_idx on public.agents(location_normalized);
create index if not exists clients_location_normalized_idx on public.clients(location_normalized);
create index if not exists assessment_leads_location_normalized_idx on public.assessment_leads(location_normalized);

-- Tell PostgREST (Supabase REST) to reload its schema cache immediately.
notify pgrst, 'reload schema';
