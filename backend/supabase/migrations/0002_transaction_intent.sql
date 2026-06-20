-- ============================================================================
-- REQUITY migration 0002 — add client transaction intent (buying/selling/other).
--
-- WHY THIS EXISTS:
--   The client assessment now captures whether the client is buying, selling, or
--   "other" (with a free-text description). The reviewer queue, agent dashboard
--   client cards, and completion email surface this value. These columns store
--   it durably alongside the rest of the submission.
--
-- WHAT THIS DOES:
--   - Idempotently ADDs three text columns to assessment_leads, clients, and
--     assessments:
--       transaction_intent        : 'buying' | 'selling' | 'other' (raw value)
--       transaction_intent_label  : display label ('Buying' / 'Selling' / custom)
--       transaction_intent_other  : the custom text typed when intent = 'other'
--
-- SAFETY:
--   - 100% idempotent: safe to run multiple times (ADD COLUMN IF NOT EXISTS).
--   - Never drops columns, tables, or data.
--   - Old rows simply have NULLs (the app renders "Not specified" for those).
-- ============================================================================

alter table public.assessment_leads add column if not exists transaction_intent text;
alter table public.assessment_leads add column if not exists transaction_intent_label text;
alter table public.assessment_leads add column if not exists transaction_intent_other text;

alter table public.clients add column if not exists transaction_intent text;
alter table public.clients add column if not exists transaction_intent_label text;
alter table public.clients add column if not exists transaction_intent_other text;

alter table public.assessments add column if not exists transaction_intent text;
alter table public.assessments add column if not exists transaction_intent_label text;
alter table public.assessments add column if not exists transaction_intent_other text;

-- Tell PostgREST (Supabase REST) to reload its schema cache so the new columns
-- are immediately usable by the service-role writes.
notify pgrst, 'reload schema';
