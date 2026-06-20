-- ============================================================================
-- REQUITY migration 0004 — email_events dedupe + provider enrichment.
--
-- WHY THIS EXISTS:
--   Transactional emails (client-completed, client-matched) must not be sent
--   twice for the same logical event when an assessment is retried or a match
--   row is re-created. We dedupe using a unique `event_key` and enrich the
--   audit row with provider + error details for observability.
--
-- WHAT THIS DOES:
--   - Idempotently ADDs columns to public.email_events:
--       event_key           : unique idempotency key (e.g. assessment_completed:<id>)
--       event_type          : coarse type (assessment_completed | client_matched)
--       provider            : 'brevo'
--       provider_message_id : Brevo messageId
--       error_message       : safe error string when a send failed
--       metadata            : jsonb details (mirror of payload)
--   - Adds a UNIQUE index on event_key (NULLs allowed, so legacy rows are fine).
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS).
--   - Never drops columns, tables, or data. Old rows keep working (event_key NULL).
-- ============================================================================

alter table public.email_events add column if not exists event_key text;
alter table public.email_events add column if not exists event_type text;
alter table public.email_events add column if not exists provider text;
alter table public.email_events add column if not exists provider_message_id text;
alter table public.email_events add column if not exists error_message text;
alter table public.email_events add column if not exists metadata jsonb default '{}'::jsonb;

-- Unique idempotency key. NULLs are allowed and not considered equal, so legacy
-- rows (and any event that opts out of dedupe) are unaffected.
create unique index if not exists email_events_event_key_key
  on public.email_events (event_key)
  where event_key is not null;

-- Tell PostgREST (Supabase REST) to reload its schema cache so the new columns
-- are immediately usable by the service-role writes.
notify pgrst, 'reload schema';
