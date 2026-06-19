import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { env } from "./env.js";
import {
  clientArchetypeMap,
  type ClientOrientation,
  type ClientStyle,
  type StressResponse,
  type ClientSource,
} from "./matching.js";
import { createNotification } from "./messages.js";
import { sendAndRecordClientCompleteEmail } from "./emailEvents.js";
import { completeAssessmentLead, upsertAssessmentLeadStart } from "./assessmentLeads.js";
import {
  insertWithSchemaFallback,
  updateWithSchemaFallback,
  isMissingTableError,
} from "./supabaseWrite.js";
import { logger } from "./logger.js";

/**
 * Thrown only when NO durable client-assessment storage exists on the live DB
 * (no assessments table AND no assessment_leads table). The API maps this to a
 * clear setup error rather than a generic failure.
 */
export class ClientAssessmentStorageError extends Error {
  status = 500;
  appCode = "CLIENT_ASSESSMENT_STORAGE_MISSING";
  area = "public.assessments";
  detail: string;
  constructor(detail: string) {
    super("Client assessment storage is not configured.");
    this.name = "ClientAssessmentStorageError";
    this.detail = detail;
  }
}

/**
 * Public-facing source values accepted by the API (mapped to DB enum below).
 *  - qr / agent_link : came from an agent's QR/link → attaches to that agent.
 *  - reviewer        : a REQUITY reviewer-created link (carries a token).
 *  - client          : a direct public client assessment (no agent, no token) →
 *                      routed to the REQUITY reviewer queue.
 */
export type ClientLinkSource = "qr" | "agent_link" | "reviewer" | "client";

/** Map the API source to the database `client_source` enum. */
export function normalizeClientSource(source: ClientLinkSource): ClientSource {
  // Direct public clients and reviewer-created clients both enter the reviewer
  // queue. Only qr/agent_link attach directly to an agent.
  return source === "reviewer" || source === "client" ? "requity_reviewer" : "qr";
}

/**
 * Map a public client source to the `assessment_leads.source` enum, which only
 * allows qr/agent_link/reviewer. Direct public 'client' leads are tracked as
 * reviewer-queue follow-ups.
 */
export function toLeadSource(source: ClientLinkSource): "qr" | "agent_link" | "reviewer" {
  return source === "qr" || source === "agent_link" ? source : "reviewer";
}

/**
 * Client assessment lifecycle.
 *
 * Source rules (see backend/docs/CURSOR_BUILD_PLAN.md):
 *  - QR / agent-link clients (`source = 'qr'`) attach directly to that agent and
 *    NEVER enter the REQUITY reviewer queue.
 *  - REQUITY reviewer clients (`source = 'requity_reviewer'`) go into the reviewer
 *    queue for approval before assignment.
 */

export type ClientAnswers = Record<string | number, string>;

export type ClientDimensions = {
  orientation: ClientOrientation;
  style: ClientStyle;
  stressResponse: StressResponse;
};

export type ClientArchetypeResult = ClientDimensions & { archetype: string };

export type ContactInfo = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
};

// --- Archetype derivation -------------------------------------------------

const ORIENTATION_VOTES: Record<string, ClientOrientation> = {
  decide_quickly: "Driver",
  lead_process: "Driver",
  direct_assertive: "Driver",
  take_charge: "Driver",
  trust_instincts: "Driver",
  in_control: "Driver",
  asap: "Driver",
  achieved_goals: "Driver",
  discuss_options: "Collaborator",
  collaborate_team: "Collaborator",
  collaborative_winwin: "Collaborator",
  work_together: "Collaborator",
  seek_advice: "Collaborator",
  team_support: "Collaborator",
  positive_experience: "Collaborator",
  someone_guide: "Collaborator",
  guided_expert: "Collaborator",
  trusted_guidance: "Collaborator",
  agent_handle: "Collaborator",
  need_reassurance: "Collaborator",
};

const STYLE_VOTES: Record<string, ClientStyle> = {
  design_aesthetics: "Design-Focused",
  visual_appeal: "Design-Focused",
  emotional_connection: "Design-Focused",
  space_layout: "Design-Focused",
  visual_materials: "Design-Focused",
  practical_features: "Practical",
  affordability: "Practical",
  location: "Practical",
  practical_aspects: "Practical",
  investment_value: "Practical",
  financial_aspects: "Practical",
  research_thoroughly: "Practical",
  well_informed: "Practical",
  detailed_explanations: "Practical",
  careful_strategic: "Practical",
};

const STRESS_VOTES: Record<string, StressResponse> = {
  clear_guidance: "Freeze",
  clear_plan: "Freeze",
  information_clarity: "Freeze",
  space_time: "Freeze",
  space_process: "Freeze",
  quick_solutions: "Fight",
  distraction_humor: "Flight",
  avoid_postpone: "Flight",
  no_rush: "Flight",
  flexible_timing: "Flight",
  step_back: "Flight",
  extra_reassurance: "Fawn",
  encouragement: "Fawn",
  relationship_conflicts: "Fawn",
};

function tallyWinner<T extends string>(
  answers: ClientAnswers,
  votes: Record<string, T>,
  fallback: T,
  ordered: T[]
): T {
  const counts = new Map<T, number>();
  for (const value of Object.values(answers)) {
    const vote = votes[value];
    if (vote) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  let winner = fallback;
  let best = -1;
  for (const candidate of ordered) {
    const count = counts.get(candidate) ?? 0;
    if (count > best) {
      best = count;
      winner = candidate;
    }
  }
  return winner;
}

export function deriveClientDimensions(answers: ClientAnswers): ClientDimensions {
  return {
    orientation: tallyWinner(answers, ORIENTATION_VOTES, "Collaborator", ["Driver", "Collaborator"]),
    style: tallyWinner(answers, STYLE_VOTES, "Practical", ["Design-Focused", "Practical"]),
    stressResponse: tallyWinner(answers, STRESS_VOTES, "Freeze", ["Freeze", "Fight", "Flight", "Fawn"]),
  };
}

export function archetypeFromDimensions(dimensions: ClientDimensions): string {
  const match = Object.values(clientArchetypeMap).find(
    (entry) =>
      entry.orientation === dimensions.orientation &&
      entry.style === dimensions.style &&
      entry.stressResponse === dimensions.stressResponse
  );
  return match?.archetype ?? "The Supporter";
}

export function calculateClientArchetype(answers: ClientAnswers): ClientArchetypeResult {
  const dimensions = deriveClientDimensions(answers);
  return { ...dimensions, archetype: archetypeFromDimensions(dimensions) };
}

// --- Persistence ----------------------------------------------------------

export type CreateClientAssessmentParams = {
  contact: ContactInfo;
  source: ClientSource;
  /** Required for QR/agent-link clients so they attach to that agent. */
  agentId?: string | null;
  /** Optional agent public token (alternative to agentId for QR links). */
  agentToken?: string | null;
};

export type ClientAssessmentRecord = {
  clientId: string;
  assessmentId: string;
  token: string;
  source: ClientSource;
  assignedAgentId: string | null;
};

async function resolveAgentId(params: {
  agentId?: string | null;
  agentToken?: string | null;
}): Promise<string | null> {
  if (params.agentId) return params.agentId;
  if (!params.agentToken) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("public_assessment_token", params.agentToken)
    .maybeSingle();
  return data?.id ?? null;
}

/** Create a client + draft assessment. QR clients attach to the agent immediately. */
export async function createClientAssessment(
  params: CreateClientAssessmentParams
): Promise<ClientAssessmentRecord> {
  const supabase = getSupabaseAdmin();
  const assignedAgentId =
    params.source === "qr" ? await resolveAgentId(params) : null;

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      assigned_agent_id: assignedAgentId,
      source: params.source,
      full_name: params.contact.fullName,
      email: params.contact.email ?? null,
      phone: params.contact.phone ?? null,
      date_of_birth: params.contact.dateOfBirth ?? null,
      status: "started",
    })
    .select()
    .single();
  if (clientError) throw new Error(`createClientAssessment (client) failed: ${clientError.message}`);

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .insert({
      client_id: client.id,
      agent_id: assignedAgentId,
      assessment_type: "client",
      status: "started",
    })
    .select()
    .single();
  if (assessmentError)
    throw new Error(`createClientAssessment (assessment) failed: ${assessmentError.message}`);

  // QR clients notify their agent that activity has begun.
  if (params.source === "qr" && assignedAgentId) {
    await safeNotifyAgentActivity(assignedAgentId, client.id, "client_assessment_started", {
      title: `${params.contact.fullName} started their assessment`,
      body: "A client from your QR code link has started the REQUITY assessment.",
    });
  }

  return {
    clientId: client.id,
    assessmentId: assessment.id,
    token: assessment.token,
    source: params.source,
    assignedAgentId,
  };
}

export type SubmitClientAssessmentParams = {
  /** Assessment token (preferred) or client id to update. */
  token?: string;
  clientId?: string;
  answers: ClientAnswers;
};

export type SubmitClientAssessmentResult = ClientArchetypeResult & {
  /** Null when public.clients is missing on the live DB (optional enrichment). */
  clientId: string | null;
  source: ClientSource;
  assignedAgentId: string | null;
  status: string;
};

/**
 * Complete a client assessment: calculate the archetype and route by source.
 *  - QR clients become `assigned` and stay with the agent (no reviewer queue).
 *  - Reviewer clients become `reviewer_matching` and await reviewer approval.
 */
export async function submitClientAssessment(
  params: SubmitClientAssessmentParams
): Promise<SubmitClientAssessmentResult> {
  const supabase = getSupabaseAdmin();
  const result = calculateClientArchetype(params.answers);

  const assessmentQuery = supabase
    .from("assessments")
    .select("id, client_id")
    .eq("assessment_type", "client");
  const { data: assessment, error: lookupError } = params.token
    ? await assessmentQuery.eq("token", params.token).single()
    : await assessmentQuery.eq("client_id", params.clientId!).single();
  if (lookupError) throw new Error(`submitClientAssessment lookup failed: ${lookupError.message}`);

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, source, assigned_agent_id, full_name")
    .eq("id", assessment.client_id)
    .single();
  if (clientError) throw new Error(`submitClientAssessment client failed: ${clientError.message}`);

  const isQr = client.source === "qr";
  const nextStatus = isQr ? "assigned" : "reviewer_matching";

  await supabase
    .from("assessments")
    .update({
      answers: params.answers,
      result,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", assessment.id);

  await supabase
    .from("clients")
    .update({
      archetype: result.archetype,
      orientation: result.orientation,
      style: result.style,
      stress_response: result.stressResponse,
      status: nextStatus,
    })
    .eq("id", client.id);

  // QR clients stay with their agent and notify them. Reviewer clients are left
  // for the reviewer queue (handled by reviewerMatches.ts) and are NOT notified
  // to an agent here.
  if (isQr && client.assigned_agent_id) {
    await safeNotifyAgentActivity(
      client.assigned_agent_id,
      client.id,
      "client_assessment_completed",
      {
        title: `${client.full_name} completed the assessment`,
        body: `Archetype: ${result.archetype}. This QR client stays assigned to you.`,
      }
    );
  }

  return {
    ...result,
    clientId: client.id,
    source: client.source,
    assignedAgentId: client.assigned_agent_id,
    status: nextStatus,
  };
}

export async function getClientAssessmentByToken(token: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assessments")
    .select("*, clients(*)")
    .eq("token", token)
    .eq("assessment_type", "client")
    .maybeSingle();
  if (error) throw new Error(`getClientAssessmentByToken failed: ${error.message}`);
  return data;
}

/** All clients assigned to an agent, newest first, with their latest assessment. */
export async function getAgentClientAssessments(agentId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("*, assessments(*)")
    .eq("assigned_agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getAgentClientAssessments failed: ${error.message}`);
  return data ?? [];
}

// --- Link-first API flow --------------------------------------------------

export type CreateClientAssessmentLinkParams = {
  source: ClientLinkSource;
  agentId?: string | null;
  agentToken?: string | null;
  frontendUrl?: string;
};

export type ClientAssessmentLink = {
  token: string;
  surveyUrl: string;
  source: ClientLinkSource;
  dbSource: ClientSource;
  agentId: string | null;
};

/**
 * Mint a shareable client assessment link/token for an agent (or reviewer flow).
 * Creates a draft assessment row that holds the token; the client is created on
 * submit. QR / agent-link sources resolve and attach the agent.
 */
export async function createClientAssessmentLink(
  params: CreateClientAssessmentLinkParams
): Promise<ClientAssessmentLink> {
  const supabase = getSupabaseAdmin();
  const dbSource = normalizeClientSource(params.source);
  const agentId = dbSource === "qr" ? await resolveAgentId(params) : null;

  const { data, error } = await supabase
    .from("assessments")
    .insert({ agent_id: agentId, assessment_type: "client", status: "draft" })
    .select("token")
    .single();
  if (error) throw new Error(`createClientAssessmentLink failed: ${error.message}`);

  const base = (params.frontendUrl || env.frontendUrl).replace(/\/$/, "");
  const surveyUrl = `${base}/client/assessment.html?token=${data.token}&source=${params.source}`;

  return { token: data.token, surveyUrl, source: params.source, dbSource, agentId };
}

export type SubmitClientAssessmentWithContactParams = {
  token?: string | null;
  contact: ContactInfo;
  answers: ClientAnswers;
  source: ClientLinkSource;
  agentId?: string | null;
  agentToken?: string | null;
  /** Optional client-computed archetype; the server recomputes authoritatively. */
  archetypeResult?: ClientArchetypeResult | null;
  /** Optional incomplete-lead id to convert to completed. */
  leadId?: string | null;
};

export type SubmitClientAssessmentWithContactResult = SubmitClientAssessmentResult & {
  /** Null when public.assessments is missing (data saved to assessment_leads). */
  assessmentId: string | null;
  emailed: boolean;
};

/**
 * Full client submission used by the secure API route.
 *
 * Creates the client, attaches/updates the assessment, routes by source, creates
 * the `client_assessment_completed` notification, and (for QR/agent-link) sends
 * the Brevo completion email if configured.
 */
export async function submitClientAssessmentWithContact(
  params: SubmitClientAssessmentWithContactParams
): Promise<SubmitClientAssessmentWithContactResult> {
  const supabase = getSupabaseAdmin();
  const dbSource = normalizeClientSource(params.source);
  const result =
    params.answers && Object.keys(params.answers).length
      ? calculateClientArchetype(params.answers)
      : params.archetypeResult ?? calculateClientArchetype({});

  // Look up the draft assessment created by the link (if any).
  let draft: { id: string; agent_id: string | null } | null = null;
  if (params.token) {
    const { data } = await supabase
      .from("assessments")
      .select("id, agent_id")
      .eq("token", params.token)
      .eq("assessment_type", "client")
      .maybeSingle();
    draft = data ?? null;
  }

  const agentId =
    dbSource === "qr" ? draft?.agent_id ?? (await resolveAgentId(params)) : null;
  const status = dbSource === "qr" ? "assigned" : "reviewer_matching";

  const fullName = params.contact.fullName;
  const answeredCount = params.answers ? Object.keys(params.answers).length : null;
  const completedAt = new Date().toISOString();
  const leadSrc = toLeadSource(params.source);

  // ---- OPTIONAL: public.clients (legacy enrichment) ----------------------
  // The full archetype + dimensions live on the `assessments` row and the
  // `assessment_leads` row. public.clients is treated as optional enrichment:
  // if the table is missing on a drifted live DB, we skip it and keep going;
  // if only columns are missing, the resilient writer drops them.
  let clientId: string | null = null;
  let clientsTableMissing = false;
  let skippedOptionalClientsWrite = false;
  try {
    const { data: client } = await insertWithSchemaFallback<{ id: string }>(
      "clients",
      {
        assigned_agent_id: agentId,
        source: dbSource,
        full_name: fullName,
        email: params.contact.email ?? null,
        phone: params.contact.phone ?? null,
        date_of_birth: params.contact.dateOfBirth ?? null,
        archetype: result.archetype,
        orientation: result.orientation,
        style: result.style,
        stress_response: result.stressResponse,
        status,
      },
      { required: ["full_name", "source"] }
    );
    clientId = client.id;
  } catch (error) {
    if (isMissingTableError(error)) {
      clientsTableMissing = true;
      skippedOptionalClientsWrite = true;
    } else {
      throw error; // a real clients error (constraint/RLS) still surfaces
    }
  }

  // ---- DURABLE: public.assessments ---------------------------------------
  const assessmentPayload = {
    client_id: clientId,
    agent_id: agentId,
    answers: params.answers,
    result,
    status: "completed" as const,
    completed_at: completedAt,
  };

  let assessmentId: string | null = null;
  let assessmentsTableMissing = false;
  try {
    if (draft) {
      await updateWithSchemaFallback("assessments", assessmentPayload, {
        column: "id",
        value: draft.id,
      });
      assessmentId = draft.id;
    } else {
      const { data: created } = await insertWithSchemaFallback<{ id: string }>(
        "assessments",
        { assessment_type: "client", ...assessmentPayload },
        { select: "id", required: ["assessment_type"] }
      );
      assessmentId = created.id;
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      assessmentsTableMissing = true;
    } else {
      throw error;
    }
  }

  // ---- DURABLE: public.assessment_leads (also stores full answers) -------
  // This is the fallback durable store when assessments is unavailable. We
  // complete the existing lead (qr/agent-link/direct all create one at start);
  // if none exists and assessments did not save, we create + complete one so
  // the answers are never lost.
  let leadSaved = false;
  let assessmentLeadsAvailable = true;
  try {
    let lead = await completeAssessmentLead({
      leadId: params.leadId ?? null,
      clientAssessmentId: assessmentId,
      email: params.contact.email ?? null,
      source: leadSrc,
      agentId,
      archetype: result.archetype,
      answeredCount,
      partialAnswers: params.answers ?? null,
    });
    if (!lead && !assessmentId) {
      const started = await upsertAssessmentLeadStart({
        source: leadSrc,
        fullName,
        email: params.contact.email ?? null,
        phone: params.contact.phone ?? null,
        agentId,
      });
      lead = await completeAssessmentLead({
        leadId: started.id,
        clientAssessmentId: assessmentId,
        email: params.contact.email ?? null,
        source: leadSrc,
        agentId,
        archetype: result.archetype,
        answeredCount,
        partialAnswers: params.answers ?? null,
      });
    }
    leadSaved = !!lead;
  } catch (error) {
    if (isMissingTableError(error)) {
      assessmentLeadsAvailable = false;
    } else {
      console.error("[clientAssessments] lead completion failed:", error);
    }
  }

  logger.info("client_assessment_submit", {
    area: "client_assessment_submit",
    source: params.source,
    clientsTableMissing,
    skippedOptionalClientsWrite,
    assessmentsTableMissing,
    assessmentLeadsAvailable,
    durableAssessmentSaved: !!assessmentId,
    durableLeadSaved: leadSaved,
  });

  // Fail ONLY when nothing durable could be saved anywhere.
  if (!assessmentId && !leadSaved) {
    throw new ClientAssessmentStorageError(
      "No durable client-assessment storage is available (assessments and assessment_leads are both unavailable)."
    );
  }

  // Notification: client_assessment_completed (best-effort).
  let agentEmail: string | null = null;
  let agentDisplayName: string | undefined;
  let agentProfileId: string | null = null;
  if (agentId) {
    try {
      const { data: agent } = await supabase
        .from("agents")
        .select("email, display_name, profile_id")
        .eq("id", agentId)
        .maybeSingle();
      agentEmail = agent?.email ?? null;
      agentDisplayName = agent?.display_name ?? undefined;
      agentProfileId = agent?.profile_id ?? null;
    } catch (error) {
      if (!isMissingTableError(error)) console.error("[clientAssessments] agent lookup failed:", error);
    }
  }

  try {
    await createNotification({
      recipientProfileId: agentProfileId,
      agentId: agentId,
      clientId,
      type: "client_assessment_completed",
      title: `${fullName} completed the assessment`,
      body:
        dbSource === "qr"
          ? `Archetype: ${result.archetype}. This client stays assigned to you.`
          : `Archetype: ${result.archetype}. Sent to the REQUITY reviewer queue.`,
    });
  } catch (error) {
    console.error("[clientAssessments] completion notification failed:", error);
  }

  // Brevo email for QR / agent-link clients (if configured).
  let emailed = false;
  if (dbSource === "qr" && agentEmail) {
    try {
      const { send } = await sendAndRecordClientCompleteEmail(
        { email: agentEmail, name: agentDisplayName },
        { clientName: fullName, agentName: agentDisplayName, archetype: result.archetype }
      );
      emailed = send.sent;
    } catch (error) {
      console.error("[clientAssessments] completion email failed:", error);
    }
  }

  return {
    ...result,
    clientId,
    assessmentId,
    source: dbSource,
    assignedAgentId: agentId,
    status,
    emailed,
  };
}

async function safeNotifyAgentActivity(
  agentId: string,
  clientId: string,
  type: "client_assessment_started" | "client_assessment_completed",
  content: { title: string; body: string }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { data: agent } = await supabase
      .from("agents")
      .select("profile_id")
      .eq("id", agentId)
      .maybeSingle();
    await createNotification({
      recipientProfileId: agent?.profile_id ?? null,
      agentId,
      clientId,
      type,
      title: content.title,
      body: content.body,
    });
  } catch (error) {
    console.error("[clientAssessments] notification failed:", error);
  }
}
