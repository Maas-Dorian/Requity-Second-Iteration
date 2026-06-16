# Seeding the first reviewer / admin

REQUITY has **no public reviewer or admin sign-up**. Everyone signs up as an
`agent`, and a reviewer/admin role is granted manually in Supabase. This keeps
elevated access off the public surface.

> **Internal REQUITY team (admins who use both portals):** for the standing
> internal accounts (`rocco@`, `tussa@`, `mike@requityapp.com`), use
> **`backend/SEED_INTERNAL_USERS.md`** instead — it seeds them as `role = admin`
> *with* an `agents` row so they can use both the agent dashboard and the
> reviewer portal. The steps below are for granting reviewer/admin to an
> individual account.

> Roles live in `public.profiles.role` and are one of `agent`, `reviewer`, `admin`.
> RLS uses `public.requity_role()` to read the caller's role, so a profile's role
> is the single source of truth for dashboard access.

---

> **Reviewer portal URL:** `/reviewer/login.html` — the dedicated reviewer/admin
> sign-in page. Only `reviewer`/`admin` roles can open `/reviewer/index.html`;
> everyone else is redirected to `/reviewer/login.html`. There is no public
> reviewer sign-up, so the **first reviewer/admin must be promoted in Supabase**
> after the account is created (Steps 1–2 below).

## Step 1 — Create the auth user

Pick one:

- **Self-serve (recommended):** have the person open `agent/login.html` and
  "Create account" with the email they'll use as a reviewer. This creates their
  Supabase Auth user **and** a `profiles` row with `role='agent'` plus an `agents`
  row (harmless — it just won't be used for reviewing). (They can use the agent
  portal to create the account; reviewer access is granted in Step 2.)
- **Manual:** Supabase Dashboard → Authentication → Users → "Add user" (set a
  password, or invite by email). With this path a `profiles` row may not exist
  yet; Step 2b handles that.

## Step 2 — Promote the profile

Supabase Dashboard → SQL Editor.

### 2a — Profile already exists (signed up via the app)

```sql
update public.profiles
set role = 'reviewer'   -- or 'admin'
where email = 'reviewer@yourcompany.com';
```

### 2b — Profile does not exist yet (user created in the Auth UI)

```sql
insert into public.profiles (id, email, full_name, role)
select id,
       email,
       coalesce(raw_user_meta_data->>'full_name', email),
       'admin'          -- or 'reviewer'
from auth.users
where email = 'admin@yourcompany.com'
on conflict (id) do update set role = excluded.role;
```

## Step 3 — Verify

```sql
select email, role
from public.profiles
where role in ('reviewer', 'admin')
order by role;
```

Then sign in at `reviewer/login.html` (the reviewer portal) with that account:

- A `reviewer`/`admin` is redirected to `reviewer/index.html` and can load the
  reviewer queue, matches, and the "Incomplete Assessments" section.
- An `agent` (or any other role) is rejected with "This account does not have
  reviewer access," and opening the reviewer dashboard directly redirects to the
  reviewer login (or shows a clean "Access restricted" screen for a wrong role).

You can also verify programmatically — `GET /api/auth/me` (with the user's
`Authorization: Bearer <access_token>`) returns `{ role: "reviewer" }`.

---

## Security notes

- **Never expose the service role key.** Do all promotions in the Supabase SQL
  Editor (which is already authenticated). The service role key belongs only in
  Vercel server-side environment variables used by `/api` routes.
- Granting `admin`/`reviewer` is a privileged action — limit who has Supabase
  project access.
- To revoke access, set the role back to `agent` (or delete the auth user):

```sql
update public.profiles set role = 'agent' where email = 'former.reviewer@yourcompany.com';
```
