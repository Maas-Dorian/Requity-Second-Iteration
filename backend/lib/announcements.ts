import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { isMissingTableError } from "./supabaseWrite.js";
import { getLatestAgentPaymentStatuses } from "./payments.js";
import { hasUsableAgentLocation } from "./location.js";

/**
 * Reviewer-managed Updates and Announcements (migration 0015).
 *
 * Reviewers create/edit/publish/archive announcements from the Updates tab;
 * agents see active, targeted announcements after login as a dashboard banner.
 * Never shown publicly. All access is service-role via the API layer, which
 * enforces reviewer auth for management and agent auth for reads/dismissals.
 */

export const ANNOUNCEMENT_PRIORITIES = ["info", "important", "urgent", "maintenance"] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "active", "expired", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_AUDIENCES = [
  "all_agents",
  "selected_agents",
  "unpaid_agents",
  "missing_location_agents",
  "missing_archetype_agents",
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all_agents: "All agents",
  selected_agents: "Selected agents",
  unpaid_agents: "Unpaid agents",
  missing_location_agents: "Agents missing location",
  missing_archetype_agents: "Agents missing archetype",
};

/** Urgent first in the agent banner stack. */
const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  important: 1,
  maintenance: 2,
  info: 3,
};

function statusError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

function cleanText(value: unknown, max = 4000): string {
  return (value ?? "").toString().trim().slice(0, max);
}

/** CTA URLs must be relative (/...) or https to keep banners safe. */
export function isSafeCtaUrl(url: string): boolean {
  const v = url.trim();
  if (!v) return false;
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  return /^https:\/\/[^\s]+$/i.test(v);
}

/**
 * The status a reader should treat the row as RIGHT NOW, derived from the
 * stored status plus the visibility window. No cron needed: a scheduled row
 * becomes effectively active once starts_at passes, and an active row becomes
 * effectively expired once ends_at passes.
 */
export function effectiveAnnouncementStatus(
  row: { status?: unknown; starts_at?: unknown; ends_at?: unknown },
  now: Date = new Date()
): AnnouncementStatus {
  const stored = (row.status ?? "draft").toString() as AnnouncementStatus;
  if (stored === "draft" || stored === "archived") return stored;
  const nowMs = now.getTime();
  const starts = row.starts_at ? Date.parse(String(row.starts_at)) : null;
  const ends = row.ends_at ? Date.parse(String(row.ends_at)) : null;
  if (ends !== null && !Number.isNaN(ends) && ends <= nowMs) return "expired";
  if (starts !== null && !Number.isNaN(starts) && starts > nowMs) return "scheduled";
  return "active";
}

export type ReviewerAnnouncement = {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  /** Live status considering the date window (scheduled/active/expired). */
  effectiveStatus: AnnouncementStatus;
  audience: AnnouncementAudience;
  audienceLabel: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  targetAgentIds: string[];
  dismissedCount: number;
};

function toReviewerShape(
  row: any,
  targets: Map<string, string[]>,
  dismissals: Map<string, number>
): ReviewerAnnouncement {
  const audience = (row.audience ?? "all_agents") as AnnouncementAudience;
  return {
    id: row.id,
    title: row.title ?? "",
    body: row.body ?? "",
    priority: (row.priority ?? "info") as AnnouncementPriority,
    status: (row.status ?? "draft") as AnnouncementStatus,
    effectiveStatus: effectiveAnnouncementStatus(row),
    audience,
    audienceLabel: AUDIENCE_LABELS[audience] ?? "All agents",
    ctaLabel: row.cta_label ?? null,
    ctaUrl: row.cta_url ?? null,
    dismissible: row.dismissible !== false,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    createdBy: row.created_by ?? null,
    publishedAt: row.published_at ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    targetAgentIds: targets.get(row.id) ?? [],
    dismissedCount: dismissals.get(row.id) ?? 0,
  };
}

/**
 * Full reviewer list (drafts, scheduled, active, expired, archived) with the
 * summary counts for the Updates tab cards. A not-yet-migrated DB returns an
 * empty list plus announcementsTableAvailable = false so the UI can explain.
 */
export async function listReviewerAnnouncements(): Promise<{
  announcements: ReviewerAnnouncement[];
  summary: { active: number; scheduled: number; drafts: number; archived: number };
  announcementsTableAvailable: boolean;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reviewer_announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingTableError(error)) {
      return {
        announcements: [],
        summary: { active: 0, scheduled: 0, drafts: 0, archived: 0 },
        announcementsTableAvailable: false,
      };
    }
    throw new Error(`listReviewerAnnouncements failed: ${error.message}`);
  }
  const rows = (data ?? []) as any[];

  const targets = new Map<string, string[]>();
  const dismissals = new Map<string, number>();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    try {
      const { data: tRows } = await supabase
        .from("reviewer_announcement_targets")
        .select("announcement_id, agent_id")
        .in("announcement_id", ids)
        .limit(5000);
      for (const t of (tRows ?? []) as any[]) {
        const arr = targets.get(t.announcement_id) ?? [];
        arr.push(t.agent_id);
        targets.set(t.announcement_id, arr);
      }
    } catch { /* targets stay empty */ }
    try {
      const { data: dRows } = await supabase
        .from("reviewer_announcement_dismissals")
        .select("announcement_id")
        .in("announcement_id", ids)
        .limit(10000);
      for (const d of (dRows ?? []) as any[]) {
        dismissals.set(d.announcement_id, (dismissals.get(d.announcement_id) ?? 0) + 1);
      }
    } catch { /* counts stay zero */ }
  }

  const announcements = rows.map((r) => toReviewerShape(r, targets, dismissals));
  const summary = {
    active: announcements.filter((a) => a.effectiveStatus === "active").length,
    scheduled: announcements.filter((a) => a.effectiveStatus === "scheduled").length,
    drafts: announcements.filter((a) => a.effectiveStatus === "draft").length,
    archived: announcements.filter((a) => a.effectiveStatus === "archived").length,
  };
  return { announcements, summary, announcementsTableAvailable: true };
}

export type SaveAnnouncementParams = {
  announcementId?: string | null;
  title: string;
  body: string;
  priority: string;
  audience: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  dismissible?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Required (non-empty) when audience = selected_agents. */
  targetAgentIds?: string[] | null;
  /** true = publish now, false/undefined = keep or save as draft. */
  publishNow?: boolean;
  reviewerProfileId?: string | null;
};

function validateAnnouncement(params: SaveAnnouncementParams): void {
  if (!cleanText(params.title, 200)) throw statusError(400, "A title is required.");
  if (!cleanText(params.body)) throw statusError(400, "A body is required.");
  if (!(ANNOUNCEMENT_PRIORITIES as readonly string[]).includes(params.priority)) {
    throw statusError(400, `Invalid priority. Expected one of: ${ANNOUNCEMENT_PRIORITIES.join(", ")}.`);
  }
  if (!(ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(params.audience)) {
    throw statusError(400, `Invalid audience. Expected one of: ${ANNOUNCEMENT_AUDIENCES.join(", ")}.`);
  }
  const ctaUrl = cleanText(params.ctaUrl, 500);
  const ctaLabel = cleanText(params.ctaLabel, 80);
  if (ctaUrl && !isSafeCtaUrl(ctaUrl)) {
    throw statusError(400, "The CTA URL must be a relative URL (/...) or an https URL.");
  }
  if (ctaUrl && !ctaLabel) {
    throw statusError(400, "A CTA label is required when a CTA URL is set.");
  }
  if (params.startsAt && params.endsAt) {
    const s = Date.parse(params.startsAt);
    const e = Date.parse(params.endsAt);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e <= s) {
      throw statusError(400, "The end date must be after the start date.");
    }
  }
  if (params.audience === "selected_agents" && !(params.targetAgentIds ?? []).length) {
    throw statusError(400, "Select at least one agent for a selected-agents announcement.");
  }
}

/** Replace the selected-agents target rows for one announcement. */
async function writeTargets(announcementId: string, agentIds: string[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("reviewer_announcement_targets")
    .delete()
    .eq("announcement_id", announcementId);
  const unique = [...new Set(agentIds.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await supabase.from("reviewer_announcement_targets").insert(
    unique.map((agentId) => ({ announcement_id: announcementId, agent_id: agentId }))
  );
  if (error) throw new Error(`announcement targets write failed: ${error.message}`);
}

/**
 * Create a new announcement (draft, or published immediately) or update an
 * existing one when announcementId is provided. Editing an announcement keeps
 * its status unless publishNow is set.
 */
export async function saveReviewerAnnouncement(params: SaveAnnouncementParams): Promise<{
  ok: true;
  announcementId: string;
  status: AnnouncementStatus;
}> {
  validateAnnouncement(params);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const startsAt = params.startsAt || null;

  const fields: Record<string, unknown> = {
    title: cleanText(params.title, 200),
    body: cleanText(params.body),
    priority: params.priority,
    audience: params.audience,
    cta_label: cleanText(params.ctaLabel, 80) || null,
    cta_url: cleanText(params.ctaUrl, 500) || null,
    dismissible: params.dismissible !== false,
    starts_at: startsAt,
    ends_at: params.endsAt || null,
    updated_by: params.reviewerProfileId ?? null,
    updated_at: now,
  };

  let announcementId = (params.announcementId ?? "").trim() || null;
  let status: AnnouncementStatus;

  if (announcementId) {
    const { data: existing, error: lookupError } = await supabase
      .from("reviewer_announcements")
      .select("id, status")
      .eq("id", announcementId)
      .maybeSingle();
    if (lookupError) throw new Error(`announcement lookup failed: ${lookupError.message}`);
    if (!existing) throw statusError(404, "Announcement not found.");
    status = params.publishNow
      ? "active"
      : ((existing as any).status ?? "draft") as AnnouncementStatus;
    if (params.publishNow) {
      fields.status = "active";
      fields.published_at = now;
      fields.archived_at = null;
    }
    const { error } = await supabase
      .from("reviewer_announcements")
      .update(fields)
      .eq("id", announcementId);
    if (error) throw new Error(`announcement update failed: ${error.message}`);
  } else {
    status = params.publishNow ? "active" : "draft";
    const { data, error } = await supabase
      .from("reviewer_announcements")
      .insert({
        ...fields,
        status,
        published_at: params.publishNow ? now : null,
        created_by: params.reviewerProfileId ?? null,
        created_at: now,
      })
      .select("id")
      .single();
    if (error) throw new Error(`announcement create failed: ${error.message}`);
    announcementId = (data as any).id as string;
  }

  if (params.audience === "selected_agents") {
    await writeTargets(announcementId, params.targetAgentIds ?? []);
  } else {
    // Audience changed away from selected_agents: stale targets are removed.
    await writeTargets(announcementId, []);
  }

  console.log("REVIEWER_ANNOUNCEMENT_SAVED", { announcementId, status, audience: params.audience });
  return { ok: true, announcementId, status };
}

/** Publish, unpublish (back to draft), or archive one announcement. */
export async function setReviewerAnnouncementStatus(
  announcementId: string,
  action: "publish" | "unpublish" | "archive"
): Promise<{ ok: true; announcementId: string; status: AnnouncementStatus }> {
  const supabase = getSupabaseAdmin();
  const id = (announcementId ?? "").trim();
  if (!id) throw statusError(400, "An announcementId is required.");
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: now };
  let status: AnnouncementStatus;
  if (action === "publish") {
    status = "active";
    patch.status = "active";
    patch.published_at = now;
    patch.archived_at = null;
  } else if (action === "unpublish") {
    status = "draft";
    patch.status = "draft";
    patch.archived_at = null;
  } else if (action === "archive") {
    status = "archived";
    patch.status = "archived";
    patch.archived_at = now;
  } else {
    throw statusError(400, "Invalid action. Expected publish, unpublish, or archive.");
  }

  const { data, error } = await supabase
    .from("reviewer_announcements")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`announcement status update failed: ${error.message}`);
  if (!data) throw statusError(404, "Announcement not found.");

  console.log("REVIEWER_ANNOUNCEMENT_STATUS", { announcementId: id, action, status });
  return { ok: true, announcementId: id, status };
}

/**
 * Permanent removal ("Remove entirely"). Targets and dismissals cascade.
 * The reviewer UI requires an explicit confirmation before calling this.
 */
export async function deleteReviewerAnnouncement(announcementId: string): Promise<{
  ok: true;
  announcementId: string;
  deleted: true;
}> {
  const supabase = getSupabaseAdmin();
  const id = (announcementId ?? "").trim();
  if (!id) throw statusError(400, "An announcementId is required.");
  const { data, error } = await supabase
    .from("reviewer_announcements")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`announcement delete failed: ${error.message}`);
  if (!data) throw statusError(404, "Announcement not found.");
  console.log("REVIEWER_ANNOUNCEMENT_DELETED", { announcementId: id });
  return { ok: true, announcementId: id, deleted: true };
}

export type AgentAnnouncement = {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissible: boolean;
};

/**
 * The announcements ONE authenticated agent should see right now:
 *  - stored status active (or scheduled whose start time has passed)
 *  - inside the starts_at/ends_at window
 *  - audience matches this agent (all, selected, unpaid, missing location,
 *    missing archetype)
 *  - not already dismissed by this agent
 * Sorted urgent > important > maintenance > info, newest first within equal
 * priority. Resilient: a not-yet-migrated DB returns [].
 */
export async function listAgentAnnouncements(agentId: string): Promise<AgentAnnouncement[]> {
  const supabase = getSupabaseAdmin();

  let rows: any[] = [];
  {
    const { data, error } = await supabase
      .from("reviewer_announcements")
      .select("*")
      .in("status", ["active", "scheduled"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isMissingTableError(error)) return [];
      throw new Error(`listAgentAnnouncements failed: ${error.message}`);
    }
    rows = ((data ?? []) as any[]).filter(
      (r) => effectiveAnnouncementStatus(r) === "active"
    );
  }
  if (!rows.length) return [];

  // Dismissals for this agent (dismissible banners the agent already closed).
  const dismissed = new Set<string>();
  try {
    const { data } = await supabase
      .from("reviewer_announcement_dismissals")
      .select("announcement_id")
      .eq("agent_id", agentId)
      .limit(1000);
    for (const d of (data ?? []) as any[]) dismissed.add(d.announcement_id);
  } catch { /* none dismissed */ }
  rows = rows.filter((r) => !(r.dismissible !== false && dismissed.has(r.id)));
  if (!rows.length) return [];

  // Audience checks, computed lazily only when such an audience exists.
  const audiences = new Set(rows.map((r) => (r.audience ?? "all_agents") as string));

  let targetedIds: Set<string> | null = null;
  if (audiences.has("selected_agents")) {
    targetedIds = new Set();
    try {
      const { data } = await supabase
        .from("reviewer_announcement_targets")
        .select("announcement_id")
        .eq("agent_id", agentId)
        .limit(1000);
      for (const t of (data ?? []) as any[]) targetedIds.add(t.announcement_id);
    } catch { /* not targeted */ }
  }

  let isUnpaid = false;
  if (audiences.has("unpaid_agents")) {
    try {
      const payments = await getLatestAgentPaymentStatuses([agentId]);
      const status = payments.get(agentId)?.status ?? "unpaid";
      isUnpaid = status === "unpaid" || status === "invoice_sent";
    } catch {
      isUnpaid = true; // no payment record means unpaid
    }
  }

  let missingLocation = false;
  let missingArchetype = false;
  if (audiences.has("missing_location_agents") || audiences.has("missing_archetype_agents")) {
    try {
      const { data: agentRow } = await supabase
        .from("agents")
        .select("*")
        .eq("id", agentId)
        .maybeSingle();
      missingLocation = !hasUsableAgentLocation(agentRow ?? {});
      missingArchetype = !(agentRow as any)?.archetype;
    } catch { /* both stay false */ }
  }

  const visible = rows.filter((r) => {
    const audience = (r.audience ?? "all_agents") as string;
    if (audience === "all_agents") return true;
    if (audience === "selected_agents") return targetedIds?.has(r.id) ?? false;
    if (audience === "unpaid_agents") return isUnpaid;
    if (audience === "missing_location_agents") return missingLocation;
    if (audience === "missing_archetype_agents") return missingArchetype;
    return false;
  });

  visible.sort((a, b) => {
    const pa = PRIORITY_ORDER[(a.priority ?? "info") as string] ?? 3;
    const pb = PRIORITY_ORDER[(b.priority ?? "info") as string] ?? 3;
    if (pa !== pb) return pa - pb;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  return visible.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    body: r.body ?? "",
    priority: (r.priority ?? "info") as AnnouncementPriority,
    ctaLabel: r.cta_label ?? null,
    ctaUrl: r.cta_url ?? null,
    dismissible: r.dismissible !== false,
  }));
}

/**
 * Record one agent's dismissal of a dismissible announcement. The agent
 * identity comes from the authenticated session; an agent can only ever
 * dismiss for themselves.
 */
export async function dismissAgentAnnouncement(
  announcementId: string,
  agentId: string
): Promise<{ ok: true; announcementId: string }> {
  const supabase = getSupabaseAdmin();
  const id = (announcementId ?? "").trim();
  if (!id) throw statusError(400, "An announcementId is required.");

  const { data: row, error } = await supabase
    .from("reviewer_announcements")
    .select("id, dismissible")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`announcement dismiss lookup failed: ${error.message}`);
  if (!row) throw statusError(404, "Announcement not found.");
  if ((row as any).dismissible === false) {
    throw statusError(400, "This announcement cannot be dismissed.");
  }

  const { error: upsertError } = await supabase
    .from("reviewer_announcement_dismissals")
    .upsert(
      { announcement_id: id, agent_id: agentId, dismissed_at: new Date().toISOString() },
      { onConflict: "announcement_id,agent_id" }
    );
  if (upsertError) throw new Error(`announcement dismiss failed: ${upsertError.message}`);
  return { ok: true, announcementId: id };
}
