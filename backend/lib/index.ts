/**
 * REQUITY backend library barrel.
 * Import from here for a clean public surface, e.g.
 *   import { getSupabaseAdmin, rankAgentsForClient, sendReviewerMatchEmail } from "../lib/index.js";
 */
export { env } from "./env.js";
export { getSupabaseClient, supabase } from "./supabaseClient.js";
export { getSupabaseAdmin, supabaseAdmin } from "./supabaseAdmin.js";
export * from "./matching.js";
export {
  sendBrevoEmail,
  sendReviewerMatchEmail,
  type BrevoEmail,
  type EmailRecipient,
  type SendResult,
} from "./brevo.js";

export {
  createNotification,
  getAgentNotifications,
  markNotificationRead,
  REVIEWER_MATCH_NOTIFICATION_BODY,
  type NotificationType,
  type NotificationRecord,
  type CreateNotificationParams,
} from "./messages.js";

export {
  recordEmailEvent,
  sendAndRecordReviewerMatchEmail,
  type EmailEventRecord,
  type RecordEmailEventParams,
} from "./emailEvents.js";

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
} from "./clientAssessments.js";

export {
  submitAgentAssessment,
  calculateAgentArchetype,
  type AgentAnswers,
  type AgentArchetypeResult,
  type SubmitAgentAssessmentParams,
  type SubmitAgentAssessmentResult,
} from "./agentAssessments.js";

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
} from "./reviewerMatches.js";

export {
  getAgentDashboard,
  type AgentDashboard,
} from "./dashboard.js";

export {
  sendClientAssessmentCompleteEmail,
} from "./brevo.js";

export {
  sendAndRecordClientCompleteEmail,
} from "./emailEvents.js";

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
} from "./auth.js";

export {
  checkRateLimit,
  pruneRateLimitBuckets,
  type RateLimitResult,
  type RateLimitAction,
} from "./rateLimit.js";

export {
  logger,
  logApiStart,
  logValidationFailure,
  logSupabaseError,
  logBrevoFailure,
  type LogLevel,
  type LogContext,
} from "./logger.js";

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
} from "./users.js";

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
} from "./assessmentLeads.js";
