-- ============================================================================
-- REQUITY migration 0007 — branded public agent slug.
--
-- WHY THIS EXISTS:
--   Agent share links now use a clean, human-readable URL instead of exposing
--   the raw public_assessment_token:
--     https://www.requityapp.com/<name>-requityapp-relational-assessment
--   The slug is derived from the agent's display name (never the id/token/email)
--   and resolved server-side to the correct agent. The raw token link still
--   works for backward compatibility (old links + QR codes).
--
-- VALUES:
--   public_slug: lowercase, hyphenated, always ends with
--   "-requityapp-relational-assessment". Unique across agents. NULL until
--   generated (backfilled on bootstrap or next dashboard load).
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN / CREATE INDEX IF NOT EXISTS).
--   - Partial unique index ignores NULLs so un-backfilled agents never collide.
-- ============================================================================

alter table public.agents add column if not exists public_slug text;

create unique index if not exists agents_public_slug_unique_idx
  on public.agents (public_slug)
  where public_slug is not null;

-- Tell PostgREST (Supabase REST) to reload its schema cache immediately.
notify pgrst, 'reload schema';
