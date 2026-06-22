import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { insertWithSchemaFallback } from "./supabaseWrite.js";

/**
 * User / profile / agent management for Supabase Auth.
 *
 * These run server-side with the service role (RLS is bypassed). They map a
 * Supabase Auth user to a REQUITY `profiles` row (with a role) and, for agents,
 * an `agents` row. The agent's `display_name` stores the full name and
 * `public_assessment_token` is exposed as `publicToken`.
 */

export type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
  role: "client" | "agent" | "reviewer" | "admin";
  created_at: string;
  updated_at: string;
};

export type AgentRecord = {
  id: string;
  profile_id: string | null;
  display_name: string;
  email: string;
  phone: string | null;
  brokerage: string | null;
  license_number: string | null;
  archetype: string | null;
  archetype_completed_at: string | null;
  public_assessment_token: string;
  created_at: string;
  updated_at: string;
};

export type AgentInput = {
  userId: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  brokerage?: string | null;
  licenseNumber?: string | null;
  /** ToS acceptance — recorded only when a NEW profile row is created. */
  termsAccepted?: boolean;
  termsVersion?: string | null;
};

export async function getProfileByUserId(userId: string): Promise<ProfileRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return (data as ProfileRecord) ?? null;
}

export async function getAgentByProfileId(profileId: string): Promise<AgentRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data as AgentRecord) ?? null;
}

export async function getAgentByUserId(userId: string): Promise<AgentRecord | null> {
  // profile_id === auth user id in this schema, so this is a direct lookup.
  return getAgentByProfileId(userId);
}

export async function getPublicAgentByToken(publicToken: string): Promise<AgentRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("public_assessment_token", publicToken)
    .maybeSingle();
  return (data as AgentRecord) ?? null;
}

export async function listAgentsForReviewer(): Promise<AgentRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAgentsForReviewer failed: ${error.message}`);
  return (data ?? []) as AgentRecord[];
}

/**
 * Ensure a profile (role='agent') exists for the auth user, without ever
 * downgrading an existing reviewer/admin. Returns the profile.
 */
async function ensureAgentProfile(input: AgentInput): Promise<ProfileRecord> {
  const supabase = getSupabaseAdmin();
  const existing = await getProfileByUserId(input.userId);

  if (existing) {
    // Refresh email/full_name if newly provided. Upgrade the role to "agent"
    // when it is missing or still the default "client" (agent signup/self-heal),
    // but NEVER downgrade a reviewer/admin — those are intentional roles.
    const patch: Record<string, unknown> = {};
    if (input.email && input.email !== existing.email) patch.email = input.email;
    if (input.fullName && input.fullName !== existing.full_name) patch.full_name = input.fullName;
    if (!existing.role || existing.role === "client") patch.role = "agent";
    if (Object.keys(patch).length) {
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", input.userId)
        .select()
        .single();
      if (error) throw new Error(`ensureAgentProfile (update) failed: ${error.message}`);
      return data as ProfileRecord;
    }
    return existing;
  }

  // New profile: record ToS acceptance. The resilient writer drops the
  // terms_* columns automatically if the live schema has not been migrated yet,
  // so account creation still works before the migration is applied.
  const { data } = await insertWithSchemaFallback<ProfileRecord>(
    "profiles",
    {
      id: input.userId,
      email: input.email,
      full_name: input.fullName ?? null,
      role: "agent",
      ...(input.termsAccepted
        ? {
            terms_accepted_at: new Date().toISOString(),
            terms_version: input.termsVersion ?? null,
          }
        : {}),
    },
    { required: ["id", "email", "role"] }
  );
  return data;
}

/** Get or create the agent row for a user (idempotent). */
export async function ensureAgentForUser(input: AgentInput): Promise<AgentRecord> {
  const supabase = getSupabaseAdmin();
  const existing = await getAgentByProfileId(input.userId);

  if (existing) {
    // Fill in any newly provided optional fields without clobbering existing data.
    const patch: Record<string, unknown> = {};
    if (input.fullName && existing.display_name !== input.fullName) patch.display_name = input.fullName;
    if (input.phone && !existing.phone) patch.phone = input.phone;
    if (input.brokerage && !existing.brokerage) patch.brokerage = input.brokerage;
    if (input.licenseNumber && !existing.license_number) patch.license_number = input.licenseNumber;
    if (Object.keys(patch).length) {
      const { data, error } = await supabase
        .from("agents")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(`ensureAgentForUser (update) failed: ${error.message}`);
      return data as AgentRecord;
    }
    return existing;
  }

  const { data, error } = await supabase
    .from("agents")
    .insert({
      profile_id: input.userId,
      display_name: input.fullName ?? input.email,
      email: input.email,
      phone: input.phone ?? null,
      brokerage: input.brokerage ?? null,
      license_number: input.licenseNumber ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`ensureAgentForUser (insert) failed: ${error.message}`);
  return data as AgentRecord;
}

export type AgentProfileResult = { profile: ProfileRecord; agent: AgentRecord };

/**
 * Create/refresh both the profile (role='agent') and agent row for an auth user.
 * Safe to call repeatedly (e.g. after every sign-in).
 */
export async function createAgentProfileForUser(
  input: AgentInput
): Promise<AgentProfileResult> {
  const profile = await ensureAgentProfile(input);
  const agent = await ensureAgentForUser(input);
  return { profile, agent };
}
