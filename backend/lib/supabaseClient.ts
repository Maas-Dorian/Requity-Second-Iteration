import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Public Supabase client (anon key). Respects Row Level Security.
 *
 * Like supabaseAdmin, nothing runs at import time: the client is created
 * lazily and env is read with process.env directly, so a missing key never
 * crashes module initialization.
 */

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const url = readEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = readEnv(
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY"
  );
  if (!url || !anonKey) {
    throw new Error("Supabase public config is not set (SUPABASE_URL / SUPABASE_ANON_KEY).");
  }
  cached = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cached;
}

export const supabase = getSupabaseClient;
