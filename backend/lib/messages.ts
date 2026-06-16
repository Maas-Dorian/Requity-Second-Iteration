import { getSupabaseAdmin } from "./supabaseAdmin.js";

/**
 * Internal messaging / notification system.
 *
 * Notifications are stored in the `messages` table. The frontend works with the
 * granular notification types below; each maps to one of the database
 * `message_type` enum values for storage.
 */

export type NotificationType =
  | "client_link_opened"
  | "client_assessment_started"
  | "client_assessment_completed"
  | "reviewer_match_received"
  | "agent_archetype_completed"
  | "system";

export type DbMessageType =
  | "system"
  | "client_activity"
  | "reviewer_match"
  | "archetype"
  | "support";

const DB_TYPE_BY_NOTIFICATION: Record<NotificationType, DbMessageType> = {
  client_link_opened: "client_activity",
  client_assessment_started: "client_activity",
  client_assessment_completed: "client_activity",
  reviewer_match_received: "reviewer_match",
  agent_archetype_completed: "archetype",
  system: "system",
};

/** The exact body REQUITY sends to an agent on a reviewer-approved client match. */
export const REVIEWER_MATCH_NOTIFICATION_BODY =
  "You've received a client match from REQUITY! If you have any issues message requity@support.com. Thank you for working with us.";

export type CreateNotificationParams = {
  /** Profile that should see this notification (the agent's auth user id). */
  recipientProfileId?: string | null;
  /** Agent the notification relates to. */
  agentId?: string | null;
  /** Optional related client. */
  clientId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
};

export type NotificationRecord = {
  id: string;
  recipient_profile_id: string | null;
  agent_id: string | null;
  client_id: string | null;
  type: DbMessageType;
  notificationType: NotificationType;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

function decorate(row: any): NotificationRecord {
  return { ...row, notificationType: inferNotificationType(row) };
}

function inferNotificationType(row: any): NotificationType {
  switch (row.type as DbMessageType) {
    case "reviewer_match":
      return "reviewer_match_received";
    case "archetype":
      return "agent_archetype_completed";
    case "system":
      return "system";
    default:
      return "client_assessment_completed";
  }
}

export async function createNotification(
  params: CreateNotificationParams
): Promise<NotificationRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      recipient_profile_id: params.recipientProfileId ?? null,
      agent_id: params.agentId ?? null,
      client_id: params.clientId ?? null,
      type: DB_TYPE_BY_NOTIFICATION[params.type],
      title: params.title,
      body: params.body,
    })
    .select()
    .single();

  if (error) throw new Error(`createNotification failed: ${error.message}`);
  return decorate(data);
}

export async function getAgentNotifications(
  agentId: string,
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<NotificationRecord[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("messages")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (options.unreadOnly) query = query.is("read_at", null);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(`getAgentNotifications failed: ${error.message}`);
  return (data ?? []).map(decorate);
}

export async function markNotificationRead(messageId: string): Promise<NotificationRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .select()
    .single();

  if (error) throw new Error(`markNotificationRead failed: ${error.message}`);
  return decorate(data);
}
