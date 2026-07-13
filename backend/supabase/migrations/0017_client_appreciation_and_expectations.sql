-- 0017_client_appreciation_and_expectations.sql
--
-- Two new FINAL client assessment questions:
--   * appreciation_style          (single select, 5 approved values)
--   * agent_expectations_notes    (optional long-form text, max 5,000 chars)
--
-- Additive and idempotent only. Columns are nullable so every existing
-- assessment record remains valid; old rows simply show "Not answered".
-- The answers are ALSO embedded in assessments.result JSON at submit time,
-- so a drifted database that misses this migration never loses the data
-- (the resilient writers drop absent columns).

-- ---------------------------------------------------------------------------
-- public.clients
-- ---------------------------------------------------------------------------
alter table if exists public.clients
  add column if not exists appreciation_style text;

alter table if exists public.clients
  add column if not exists agent_expectations_notes text;

-- ---------------------------------------------------------------------------
-- public.assessments
-- ---------------------------------------------------------------------------
alter table if exists public.assessments
  add column if not exists appreciation_style text;

alter table if exists public.assessments
  add column if not exists agent_expectations_notes text;

-- ---------------------------------------------------------------------------
-- public.assessment_leads (durable fallback store for submitted assessments)
-- ---------------------------------------------------------------------------
alter table if exists public.assessment_leads
  add column if not exists appreciation_style text;

alter table if exists public.assessment_leads
  add column if not exists agent_expectations_notes text;

-- ---------------------------------------------------------------------------
-- Guarded check constraints: appreciation_style is either null (older records
-- or not answered) or one of the five approved values. Created only when the
-- table exists and no constraint with the same name is already present.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.clients') is not null and not exists (
    select 1 from pg_constraint
    where conname = 'clients_appreciation_style_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_appreciation_style_check
      check (
        appreciation_style is null or appreciation_style in (
          'uplifting_words',
          'proactive_assistance',
          'memorable_gestures',
          'dedicated_attention',
          'personalized_celebrations'
        )
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.assessments') is not null and not exists (
    select 1 from pg_constraint
    where conname = 'assessments_appreciation_style_check'
      and conrelid = 'public.assessments'::regclass
  ) then
    alter table public.assessments
      add constraint assessments_appreciation_style_check
      check (
        appreciation_style is null or appreciation_style in (
          'uplifting_words',
          'proactive_assistance',
          'memorable_gestures',
          'dedicated_attention',
          'personalized_celebrations'
        )
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.assessment_leads') is not null and not exists (
    select 1 from pg_constraint
    where conname = 'assessment_leads_appreciation_style_check'
      and conrelid = 'public.assessment_leads'::regclass
  ) then
    alter table public.assessment_leads
      add constraint assessment_leads_appreciation_style_check
      check (
        appreciation_style is null or appreciation_style in (
          'uplifting_words',
          'proactive_assistance',
          'memorable_gestures',
          'dedicated_attention',
          'personalized_celebrations'
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';
