# Seeding REQUITY internal team accounts

The internal REQUITY team needs accounts that can use **both** the agent
dashboard and the reviewer portal. We do this by giving them `role = 'admin'`
in `public.profiles` **and** an `public.agents` row.

| Account | Role | Agent row | Agent dashboard | Reviewer portal |
| --- | --- | --- | --- | --- |
| `rocco@requityapp.com` | `admin` | yes | ✅ | ✅ |
| `tussa@requityapp.com` | `admin` | yes | ✅ | ✅ |
| `mike@requityapp.com` | `admin` | yes | ✅ | ✅ |

- **Initial password:** `requityslaunch26` — **change it after first login**
  (Settings → "Send password reset" on the agent dashboard, or Supabase recovery).
- Admins pass reviewer/admin checks and, because they have an agent row, also
  pass agent-dashboard checks. Normal agents are still blocked from the reviewer
  portal. Reviewer-only accounts (no agent row) are never forced into the agent
  dashboard.

> **Never commit or expose the Supabase service role key.** It lives only in
> server-side environment variables (Vercel) and your local shell when running
> the seed. It is never shipped to the browser.

---

## Option A — Seed script (recommended)

Requires the service-role env vars. From the repo root:

```bash
# Either export the vars first…
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
npm run seed:internal-users

# …or pass an env file (Node 20.6+):
node --env-file=backend/.env --import tsx backend/scripts/seed-internal-users.ts
```

The script (`backend/scripts/seed-internal-users.ts`):

- creates each Supabase Auth user if missing (with the initial password and
  email pre-confirmed); existing users keep their current password,
- upserts `public.profiles` with `role = 'admin'`, `email`, and `full_name`
  (derived from the email prefix),
- ensures a `public.agents` row exists with a `public_assessment_token`,
- is **idempotent** — re-running does not duplicate users or rows.

Optional: override the initial password with `INTERNAL_SEED_PASSWORD=... npm run seed:internal-users`.

---

## Option B — Supabase Dashboard + SQL (no script)

1. **Create the auth users.** Supabase Dashboard → Authentication → Users →
   "Add user" for each of the three emails. Set the password to
   `requityslaunch26` and check "Auto Confirm User".

2. **Promote to admin and create profiles.** Supabase Dashboard → SQL Editor:

   ```sql
   insert into public.profiles (id, email, full_name, role)
   select u.id,
          u.email,
          initcap(split_part(u.email, '@', 1)),
          'admin'
   from auth.users u
   where u.email in ('rocco@requityapp.com', 'tussa@requityapp.com', 'mike@requityapp.com')
   on conflict (id) do update set role = 'admin', full_name = excluded.full_name;
   ```

3. **Create the agent rows** (so they can use the agent dashboard). The
   `public_assessment_token` column defaults automatically:

   ```sql
   insert into public.agents (profile_id, display_name, email)
   select p.id, p.full_name, p.email
   from public.profiles p
   where p.email in ('rocco@requityapp.com', 'tussa@requityapp.com', 'mike@requityapp.com')
     and not exists (select 1 from public.agents a where a.profile_id = p.id);
   ```

4. **Verify:**

   ```sql
   select p.email, p.role, a.id as agent_id, (a.public_assessment_token is not null) as has_token
   from public.profiles p
   left join public.agents a on a.profile_id = p.id
   where p.email in ('rocco@requityapp.com', 'tussa@requityapp.com', 'mike@requityapp.com');
   ```

---

## After seeding

- Sign in at `agent/login.html` → admins with an agent row are routed to the
  agent assessment (first time) or the agent dashboard (once their archetype is
  complete).
- Sign in at `reviewer/login.html` → admins go straight to `reviewer/index.html`.
- Change the initial password after first login.
