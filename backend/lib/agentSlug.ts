import { getSupabaseAdmin } from "./supabaseAdmin.js";

/**
 * Branded public agent slug helpers.
 *
 * Agent share links use a clean, human-readable URL instead of exposing the raw
 * public_assessment_token:
 *   https://www.requityapp.com/<name>-requityapp-relational-assessment
 *
 * The slug is derived ONLY from the agent's display name, never the id, profile
 * id, email, or token. It is stored on agents.public_slug and resolved
 * server-side to the correct agent. The raw token link still works for
 * backward compatibility (old links + QR codes).
 */

/** Every public slug ends with this branded suffix. */
export const SLUG_SUFFIX = "-requityapp-relational-assessment";

/** Total slug length is kept around this bound. */
const MAX_SLUG_LENGTH = 120;

/** True when a value looks like a branded public agent slug. */
export function isAgentSlug(value: string | null | undefined): boolean {
  return typeof value === "string" && value.toLowerCase().endsWith(SLUG_SUFFIX);
}

/**
 * Build the base slug for a display name (always ending with SLUG_SUFFIX):
 *   "Tussa Domingo" -> "tussa-domingo-requityapp-relational-assessment"
 * Missing/blank names fall back to "agent-requityapp-relational-assessment".
 * Rules: lowercase, trim, spaces -> hyphens, strip special chars, collapse
 * duplicate hyphens, bounded length. Never uses the id/email/token.
 */
export function slugifyAgentName(displayName?: string | null): string {
  const namePart = (displayName ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special characters
    .replace(/\s+/g, "-") // spaces -> hyphens
    .replace(/-+/g, "-") // collapse duplicate hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  const maxNameLength = Math.max(1, MAX_SLUG_LENGTH - SLUG_SUFFIX.length);
  const safeName = (namePart || "agent").slice(0, maxNameLength).replace(/-+$/g, "") || "agent";
  return `${safeName}${SLUG_SUFFIX}`;
}

/** Insert a numeric disambiguator BEFORE the suffix: name-2-requityapp-...-assessment */
function withCounter(baseSlug: string, n: number): string {
  if (n <= 1) return baseSlug;
  const namePart = baseSlug.slice(0, baseSlug.length - SLUG_SUFFIX.length);
  return `${namePart}-${n}${SLUG_SUFFIX}`;
}

/**
 * Find an unused slug for a display name, appending -2, -3, ... on collision.
 * Ignores the agent's own row (selfAgentId) so re-running is stable. On schema
 * drift (missing column/table) it returns the base candidate without failing.
 */
export async function generateUniqueAgentSlug(
  displayName?: string | null,
  selfAgentId?: string | null
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const baseSlug = slugifyAgentName(displayName);

  for (let n = 1; n < 1000; n++) {
    const candidate = withCounter(baseSlug, n);
    const { data, error } = await supabase
      .from("agents")
      .select("id")
      .eq("public_slug", candidate)
      .maybeSingle();
    if (error) return candidate; // column/table drift, can't dedupe, use as-is
    if (!data || (selfAgentId && data.id === selfAgentId)) return candidate;
  }
  // Pathological fallback (1000 same-named agents): guarantee uniqueness.
  const namePart = baseSlug.slice(0, baseSlug.length - SLUG_SUFFIX.length);
  return `${namePart}-${Date.now()}${SLUG_SUFFIX}`;
}

/**
 * Ensure the agent row has a public_slug, generating + persisting one from the
 * display name when missing. Returns the slug, or null on schema drift (the
 * public_slug column not existing yet must NOT break the caller). A display
 * name change does NOT regenerate an existing slug (old links keep working).
 */
export async function ensureAgentSlug(
  agentId: string,
  displayName?: string | null
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agents")
    .select("public_slug, display_name")
    .eq("id", agentId)
    .maybeSingle();
  if (error) return null; // public_slug column missing on a not-yet-migrated DB
  const existing = (data as { public_slug?: string | null })?.public_slug ?? null;
  if (existing) return existing;

  const name = displayName ?? (data as { display_name?: string | null })?.display_name ?? null;
  const slug = await generateUniqueAgentSlug(name, agentId);
  const { error: updateError } = await supabase
    .from("agents")
    .update({ public_slug: slug })
    .eq("id", agentId);
  if (updateError) return null; // couldn't persist (drift), caller falls back to token
  return slug;
}

/** Resolve an agent id from a public slug. Returns null when not found / drift. */
export async function getAgentIdBySlug(slug: string): Promise<string | null> {
  if (!slug) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("public_slug", slug)
    .maybeSingle();
  if (error) return null;
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Safe public agent info for a slug or token. Returns null when not found.
 * Never exposes the raw id/token to the caller.
 */
export async function getPublicAgentByReference(ref: {
  slug?: string | null;
  token?: string | null;
}): Promise<{ displayName: string | null; publicSlug: string | null; marketCity: string | null } | null> {
  const supabase = getSupabaseAdmin();
  // select("*") tolerates schema drift (e.g. market_city/public_slug not yet
  // migrated), a narrow column list would error on a missing column.
  let query = supabase.from("agents").select("*");
  if (ref.slug) query = query.eq("public_slug", ref.slug);
  else if (ref.token) query = query.eq("public_assessment_token", ref.token);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const row = data as { display_name?: string | null; public_slug?: string | null; market_city?: string | null };
  return {
    displayName: row.display_name ?? null,
    publicSlug: row.public_slug ?? null,
    marketCity: row.market_city ?? null,
  };
}
