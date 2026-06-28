/**
 * Seed REQUITY internal team accounts (server-side, service role only).
 *
 * Creates/updates the internal team's Supabase Auth users, sets them to
 * `role = 'admin'` in public.profiles, and ensures each has a public.agents row
 * (with a public_assessment_token). Admins pass both reviewer and agent checks,
 * so these accounts can use the agent dashboard AND the reviewer portal.
 *
 * SECURITY:
 *  - Runs ONLY server-side with the Supabase SERVICE ROLE key (never the browser).
 *  - The service role key is read from the environment; it is never hardcoded
 *    and never shipped to the frontend.
 *
 * Idempotent: re-running will not duplicate users or rows. Existing users keep
 * their current password (this script only sets the initial password when it
 * first creates the auth user).
 *
 * Run (service-role env vars required):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:internal-users
 * or, with an env file (Node 20.6+):
 *   node --env-file=backend/.env --import tsx backend/scripts/seed-internal-users.ts
 */
import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { ensureAgentForUser } from "../lib/users.js";

const INTERNAL_USER_EMAILS = [
  "rocco@requityapp.com",
  "tussa@requityapp.com",
  "mike@requityapp.com",
];

// Initial password for first sign-in only. Change after first login.
// Read from env when provided so it never has to live in committed code long-term.
const INITIAL_PASSWORD = process.env.INTERNAL_SEED_PASSWORD || "requityslaunch26";

function nameFromEmail(email: string): string {
  const prefix = email.split("@")[0] ?? email;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

/** Find an existing auth user by email (paginated). Returns null if not found. */
async function findAuthUserByEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string
): Promise<{ id: string; email: string | undefined } | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return { id: found.id, email: found.email ?? undefined };
    if (data.users.length < perPage) break;
  }
  return null;
}

async function seedUser(email: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const fullName = nameFromEmail(email);

  let user = await findAuthUserByEmail(supabase, email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: INITIAL_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      throw new Error(`createUser ${email} failed: ${error?.message ?? "no user returned"}`);
    }
    user = { id: data.user.id, email: data.user.email ?? email };
    console.log(`[seed] created auth user ${email} (${user.id})`);
  } else {
    console.log(`[seed] auth user ${email} already exists (${user.id}), password unchanged`);
  }

  // Force admin role (create or update the profile). Never downgrades to agent.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email, full_name: fullName, role: "admin" }, { onConflict: "id" });
  if (profileError) throw new Error(`profile upsert ${email} failed: ${profileError.message}`);

  // Ensure an agent row exists (idempotent) so they can use the agent dashboard.
  const agent = await ensureAgentForUser({ userId: user.id, email, fullName });
  console.log(
    `[seed] ${email}: role=admin, agentId=${agent.id}, token=${
      agent.public_assessment_token ? "present" : "MISSING"
    }`
  );
}

async function main(): Promise<void> {
  console.log(`[seed] seeding ${INTERNAL_USER_EMAILS.length} internal admin accounts…`);
  for (const email of INTERNAL_USER_EMAILS) {
    await seedUser(email);
  }
  console.log("[seed] done. Internal team can sign in at agent/login.html or reviewer/login.html.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
