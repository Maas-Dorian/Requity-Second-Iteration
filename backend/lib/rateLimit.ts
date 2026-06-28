/**
 * Rate limiting (placeholder).
 *
 * This is an in-memory fixed-window limiter intended as a simple interface for
 * the public submission routes. On Vercel/serverless, memory is per-instance and
 * not shared across cold starts or regions, so this is best-effort only.
 *
 * PRODUCTION: replace the store with a shared backend, e.g.
 *   - Upstash Redis (recommended for Vercel), atomic INCR + EXPIRE, or
 *   - a Supabase table with a SQL upsert + window check.
 * Keep this same `checkRateLimit` signature so callers don't change.
 */

export type RateLimitAction =
  | "client_create"
  | "client_submit"
  | "agent_submit"
  | "lead_start"
  | "lead_progress"
  | "lead_complete"
  | (string & {});

export type RateLimitResult = {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
  /** Requests remaining in the current window (best-effort). */
  remaining?: number;
  /** Epoch ms when the current window resets. */
  resetAt?: number;
};

const WINDOW_MS = 60_000;

const LIMITS: Record<string, number> = {
  client_create: 20,
  client_submit: 10,
  agent_submit: 10,
  lead_start: 15,
  // Progress fires per-answer (debounced), so it needs a higher ceiling.
  lead_progress: 120,
  lead_complete: 15,
  default: 30,
};

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function limitFor(action: RateLimitAction): number {
  return LIMITS[action] ?? LIMITS.default;
}

/**
 * Check (and record) a request against the limit for `action` keyed by `key`
 * (typically the client IP). Returns whether the request is allowed.
 */
export function checkRateLimit(key: string, action: RateLimitAction): RateLimitResult {
  const now = Date.now();
  const limit = limitFor(action);
  const bucketKey = `${action}:${key}`;

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(bucketKey, bucket);
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      allowed: false,
      blocked: true,
      reason: `Rate limit exceeded for ${action}. Try again later.`,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  return {
    allowed: true,
    blocked: false,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Occasionally purge expired buckets to bound memory (best-effort). */
export function pruneRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
