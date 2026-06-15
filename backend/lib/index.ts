/**
 * REQUITY backend library barrel.
 * Import from here for a clean public surface, e.g.
 *   import { getSupabaseAdmin, rankAgentsForClient, sendReviewerMatchEmail } from "../lib";
 */
export { env } from "./env";
export { getSupabaseClient, supabase } from "./supabaseClient";
export { getSupabaseAdmin, supabaseAdmin } from "./supabaseAdmin";
export * from "./matching";
export {
  sendBrevoEmail,
  sendReviewerMatchEmail,
  type BrevoEmail,
  type EmailRecipient,
  type SendResult,
} from "./brevo";

export {
  createNotification,
  getAgentNotifications,
  markNotificationRead,
  REVIEWER_MATCH_NOTIFICATION_BODY,
  type NotificationType,
  type NotificationRecord,
  type CreateNotificationParams,
} from "./messages";

export {
  recordEmailEvent,
  sendAndRecordReviewerMatchEmail,
  type EmailEventRecord,
  type RecordEmailEventParams,
} from "./emailEvents";

export {
  createClientAssessment,
  submitClientAssessment,
  createClientAssessmentLink,
  submitClientAssessmentWithContact,
  normalizeClientSource,
  getClientAssessmentByToken,
  getAgentClientAssessments,
  calculateClientArchetype,
  deriveClientDimensions,
  archetypeFromDimensions,
  type ClientAnswers,
  type ClientArchetypeResult,
  type ClientLinkSource,
  type CreateClientAssessmentParams,
  type CreateClientAssessmentLinkParams,
  type ClientAssessmentLink,
  type SubmitClientAssessmentParams,
  type SubmitClientAssessmentResult,
  type SubmitClientAssessmentWithContactParams,
  type SubmitClientAssessmentWithContactResult,
} from "./clientAssessments";

export {
  submitAgentAssessment,
  calculateAgentArchetype,
  type AgentAnswers,
  type AgentArchetypeResult,
  type SubmitAgentAssessmentParams,
  type SubmitAgentAssessmentResult,
} from "./agentAssessments";

export {
  createReviewerClientMatch,
  approveReviewerMatch,
  assignReviewerMatch,
  listReviewerQueue,
  rankAgentsForClient as rankAgentsForClientId,
  type RankedAgent,
  type ReviewerQueueItem,
  type CreateReviewerClientMatchParams,
  type AssignReviewerMatchParams,
  type ApproveReviewerMatchResult,
} from "./reviewerMatches";

export {
  getAgentDashboard,
  type AgentDashboard,
} from "./dashboard";

export {
  sendClientAssessmentCompleteEmail,
} from "./brevo";

export {
  sendAndRecordClientCompleteEmail,
} from "./emailEvents";

export {
  getUserFromRequest,
  mapSupabaseUserToProfile,
  requireAgent,
  requireReviewer,
  requireAdmin,
  isProduction,
  AuthError,
  type AuthedUser,
  type AuthedProfile,
  type UserRole,
  type RequestLike,
} from "./auth";

export {
  checkRateLimit,
  pruneRateLimitBuckets,
  type RateLimitResult,
  type RateLimitAction,
} from "./rateLimit";

export {
  logger,
  logApiStart,
  logValidationFailure,
  logSupabaseError,
  logBrevoFailure,
  type LogLevel,
  type LogContext,
} from "./logger";

export {
  createAgentProfileForUser,
  getProfileByUserId,
  getAgentByProfileId,
  getAgentByUserId,
  ensureAgentForUser,
  listAgentsForReviewer,
  getPublicAgentByToken,
  type ProfileRecord,
  type AgentRecord,
  type AgentInput,
  type AgentProfileResult,
} from "./users";

export {
  upsertAssessmentLeadStart,
  updateAssessmentLeadProgress,
  completeAssessmentLead,
  listReviewerAssessmentLeads,
  listAgentAssessmentLeads,
  updateAssessmentLeadFollowUpStatus,
  createIncompleteAssessmentFollowUpDraft,
  sendIncompleteAssessmentFollowUpEmail,
  type AssessmentLeadRecord,
  type LeadSource,
  type LeadStatus,
  type UpsertAssessmentLeadStartInput,
  type UpdateAssessmentLeadProgressInput,
  type CompleteAssessmentLeadInput,
  type ListReviewerLeadsFilters,
  type UpdateLeadFollowUpInput,
} from "./assessmentLeads";
