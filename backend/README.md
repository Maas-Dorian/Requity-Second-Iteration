# REQUITY New Backend Scaffold

This folder is the backend starting point for the new REQUITY platform.
It is intentionally not copied from the old Replit UI/backend. It pulls useful logic/assets from Requity 6 only where helpful.

Use Cursor to wire this into Supabase + Vercel.

## Foundation (active)

- `supabase/schema.sql`, Postgres schema, indexes, RLS starters, triggers
- `lib/env.ts`, typed environment access (Supabase, Brevo, frontend URL)
- `lib/supabaseClient.ts`, public anon client (RLS-respecting)
- `lib/supabaseAdmin.ts`, service-role client (server-side only)
- `lib/matching.ts`, agent/client matching engine + archetype percentage maps
- `lib/brevo.ts`, Brevo transactional email sender
- `lib/index.ts`, barrel export for the whole lib surface
- `emails/`, modular, on-brand email templates (`reviewerMatch`, shared `layout`)
- `.env.example`, copy to `.env` and configure in Vercel

## Setup

```bash
cd backend
npm install
npm run typecheck
```

Run `supabase/schema.sql` in the Supabase SQL editor to create the database.

## Reference (legacy, not wired in)

- `src/matching.ts`, `src/brevo.ts`, earlier scaffolds superseded by `lib/`
- `src/email/*.legacy.ts`, pulled from Requity 6 for migration reference
- `public/archetype-images/`, archetype image assets
- `docs/CURSOR_BUILD_PLAN.md`, full build plan
