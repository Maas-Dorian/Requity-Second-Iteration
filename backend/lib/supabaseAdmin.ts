import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Privileged Supabase client (service role key).
 *
 * SERVER-SIDE ONLY. This client bypasses Row Level Security and must never be
 * imported into browser/frontend bundles. Use it inside Edge Functions, API
 * routes, or other trusted server code for tasks like reviewer assignment,
 * creating messages, and writing email_events.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

export const supabaseAdmin = getSupabaseAdmin;
