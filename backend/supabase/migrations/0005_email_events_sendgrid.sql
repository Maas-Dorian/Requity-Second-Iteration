-- ============================================================================
-- REQUITY migration 0005 - email_events SendGrid enrichment.
--
-- WHY THIS EXISTS:
--   REQUITY now sends all transactional email through Twilio SendGrid (the
--   active provider). The email_events audit table gains the retry/lifecycle
--   columns the app writes so the audit trail is complete and truthful:
--   provider defaults to 'sendgrid', and we track sent_at, retry_count,
--   next_attempt_at, and updated_at.
--
-- WHAT THIS DOES:
--   - Idempotently ADDs columns to public.email_events:
--       retry_count      : integer attempt counter (default 0)
--       next_attempt_at  : when a failed/rate-limited send may be retried
--       sent_at          : timestamp of a successful (2xx) send
--       updated_at       : row update timestamp
--   - Defaults the provider column to 'sendgrid' for new rows.
--   - Leaves all existing rows and data untouched.
--
-- SAFETY:
--   - 100% idempotent (ADD COLUMN IF NOT EXISTS / ALTER COLUMN SET DEFAULT).
--   - Never drops columns, tables, or data. Legacy 'brevo' rows keep their value.
-- ============================================================================

alter table public.email_events add column if not exists retry_count integer default 0;
alter table public.email_events add column if not exists next_attempt_at timestamptz;
alter table public.email_events add column if not exists sent_at timestamptz;
alter table public.email_events add column if not exists updated_at timestamptz default now();

-- New rows default to the active provider. Existing rows are unchanged.
alter table public.email_events alter column provider set default 'sendgrid';

-- Keep updated_at fresh on every write.
create or replace function public.set_email_events_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_email_events_updated_at on public.email_events;
create trigger trg_email_events_updated_at
  before update on public.email_events
  for each row execute function public.set_email_events_updated_at();

-- Tell PostgREST (Supabase REST) to reload its schema cache so the new columns
-- are immediately usable by the service-role writes.
notify pgrst, 'reload schema';
