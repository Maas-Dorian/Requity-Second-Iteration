import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Auth mapping for the secure API layer.
 *
 * Verifies a Supabase `Authorization: Bearer <access_token>` against Supabase
 * Auth (server-side, service role) and maps the user to a REQUITY profile/role.
 *
 * Auth is always required: a missing/invalid token returns 401 and an
 * insufficient role returns 403. There is no demo bypass.
 */

export type UserRole = "client" | "agent" | "reviewer" | "admin";

export type AuthedUser = { id: string; email: string | null };

export type AuthedProfile = {
  userId: string;
  profileId: string;
  role: UserRole;
  email: string | null;
  agentId: string | null;
};

/** Minimal request shape so this module does not depend on @vercel/node. */
export type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
};

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getBearerToken(req: RequestLike): string | null {
  const raw = req.headers["authorization"] ?? req.headers["Authorization"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "string" && value.startsWith("Bearer ")) {
    const token = value.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/** Validate the bearer token (if any) and return the Supabase user, else null. */
export async function getUserFromRequest(req: RequestLike): Promise<AuthedUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Map a Supabase user to their REQUITY profile (role + linked agent row). */
export async function mapSupabaseUserToProfile(
  user: AuthedUser
): Promise<AuthedProfile | null> {
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  // Agents — and admins (internal REQUITY team) — may have an agent row, which
  // grants agent-dashboard access. Reviewers without an agent row do not.
  let agentId: string | null = null;
  if (profile.role === "agent" || profile.role === "admin") {
    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    agentId = agent?.id ?? null;
  }

  return {
    userId: user.id,
    profileId: profile.id,
    role: profile.role as UserRole,
    email: profile.email ?? user.email,
    agentId,
  };
}

async function resolveProfile(req: RequestLike): Promise<AuthedProfile | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  return mapSupabaseUserToProfile(user);
}

async function requireRole(req: RequestLike, allowed: UserRole[]) {
  const profile = await resolveProfile(req);
  // No valid token / no profile → always unauthenticated.
  if (!profile) throw new AuthError(401, "Authentication required.");
  if (!allowed.includes(profile.role)) {
    throw new AuthError(403, `Access denied. Requires one of: ${allowed.join(", ")}.`);
  }
  return profile;
}

/** Require an authenticated agent (admins also allowed). */
export function requireAgent(req: RequestLike): Promise<AuthedProfile> {
  return requireRole(req, ["agent", "admin"]);
}

/** Require a reviewer (admins also allowed). */
export function requireReviewer(req: RequestLike): Promise<AuthedProfile> {
  return requireRole(req, ["reviewer", "admin"]);
}

/** Require an admin. */
export function requireAdmin(req: RequestLike): Promise<AuthedProfile> {
  return requireRole(req, ["admin"]);
}
