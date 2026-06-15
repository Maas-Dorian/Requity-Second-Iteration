import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Public Supabase client (anon key).
 *
 * Safe to use in browser/client contexts and any code path that should respect
 * Row Level Security. Do NOT use this for privileged server operations — use
 * `supabaseAdmin` from `./supabaseAdmin` instead.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

export const supabase = getSupabaseClient;
