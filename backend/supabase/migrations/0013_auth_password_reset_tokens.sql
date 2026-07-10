-- 0013_auth_password_reset_tokens.sql
--
-- REQUITY-owned password reset tokens (additive, idempotent).
--
-- Stores ONLY a hash of each one-time reset token. The raw token exists only
-- inside the reset email link and is never persisted or logged. Tokens are
-- single use (used_at) and short lived (expires_at). Supabase Auth remains the
-- source of truth for the login password; this table only gates WHO may ask
-- the server to update it.
--
-- RLS: enabled with NO policies. Browsers can never read or write this table.
-- All access goes through the service-role API routes:
--   POST /api/auth/request-password-reset
--   POST /api/auth/complete-password-reset

create table if not exists public.auth_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Supabase Auth user this token belongs to (auth.users.id).
  user_id uuid not null,
  -- Normalized (lowercased) email the reset was requested for.
  email text not null,
  -- SHA-256 hex of the raw token. The raw token is never stored.
  token_hash text not null unique,
  expires_at timestamptz not null,
  -- Set when the token is consumed OR invalidated by a newer request.
  used_at timestamptz,
  requested_ip text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_password_reset_tokens_token_hash
  on public.auth_password_reset_tokens (token_hash);
create index if not exists idx_password_reset_tokens_email_created
  on public.auth_password_reset_tokens (email, created_at desc);
create index if not exists idx_password_reset_tokens_user_created
  on public.auth_password_reset_tokens (user_id, created_at desc);
create index if not exists idx_password_reset_tokens_expires
  on public.auth_password_reset_tokens (expires_at);

-- Deny-by-default: enable RLS and create no policies. Only the service role
-- (which bypasses RLS) may touch this table.
alter table public.auth_password_reset_tokens enable row level security;

notify pgrst, 'reload schema';
