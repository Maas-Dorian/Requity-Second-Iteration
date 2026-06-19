import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { isMissingTableError } from "./supabaseWrite.js";

/**
 * Lightweight agent dashboard analytics.
 *
 * Powers the "Assessment activity" chart with REAL last-N-days counts instead of
 * static placeholder values. The source of truth is `assessment_leads`, which is
 * created when a client starts an assessment (`started_at`) and flipped to
 * completed (`completed_at`) on submission — so it captures both started and
 * completed activity for an agent's qr/agent-link clients.
 *
 * Performance: one small, bounded query per call — scoped to a single agent and
 * the requested window (max 30 days), selecting only two timestamp columns. No
 * full-table scans, no per-row browser counting, no polling/subscriptions.
 */

export type AssessmentActivityDay = {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string;
  /** Short weekday label, e.g. "Mon". */
  label: string;
  started: number;
  completed: number;
};

export type AgentAssessmentActivity = {
  days: AssessmentActivityDay[];
  totalStarted: number;
  totalCompleted: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Count assessment leads started/completed per day for a single agent over the
 * last `days` days (default 7, max 30). Missing days are filled with zeros.
 */
export async function getAgentAssessmentActivity(
  agentId: string,
  days: number = DEFAULT_DAYS
): Promise<AgentAssessmentActivity> {
  const span = Math.min(Math.max(Math.floor(days) || DEFAULT_DAYS, 1), MAX_DAYS);
  const supabase = getSupabaseAdmin();

  // Build inclusive UTC day buckets ending today, oldest first.
  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const buckets: AssessmentActivityDay[] = [];
  const byDate: Record<string, AssessmentActivityDay> = {};
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(todayUtcMs - i * DAY_MS);
    const key = utcDateKey(d);
    const bucket: AssessmentActivityDay = {
      date: key,
      label: WEEKDAY_LABELS[d.getUTCDay()],
      started: 0,
      completed: 0,
    };
    buckets.push(bucket);
    byDate[key] = bucket;
  }

  const cutoff = `${buckets[0].date}T00:00:00.000Z`;

  // Single lightweight query: this agent only, within the window, two columns.
  const { data, error } = await supabase
    .from("assessment_leads")
    .select("started_at, completed_at")
    .eq("agent_id", agentId)
    .or(`started_at.gte.${cutoff},completed_at.gte.${cutoff}`);
  if (error) {
    // On a drifted live DB without assessment_leads, show a clean zero-filled
    // chart ("No activity yet.") instead of failing.
    if (isMissingTableError(error)) {
      return { days: buckets, totalStarted: 0, totalCompleted: 0 };
    }
    throw new Error(`getAgentAssessmentActivity failed: ${error.message}`);
  }

  let totalStarted = 0;
  let totalCompleted = 0;
  for (const row of data ?? []) {
    const startedAt = (row as { started_at?: string | null }).started_at;
    const completedAt = (row as { completed_at?: string | null }).completed_at;
    if (startedAt) {
      const key = String(startedAt).slice(0, 10);
      if (byDate[key]) {
        byDate[key].started += 1;
        totalStarted += 1;
      }
    }
    if (completedAt) {
      const key = String(completedAt).slice(0, 10);
      if (byDate[key]) {
        byDate[key].completed += 1;
        totalCompleted += 1;
      }
    }
  }

  return { days: buckets, totalStarted, totalCompleted };
}
