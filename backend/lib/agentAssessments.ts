import {
  agentArchetypeMap,
  type AgentInteractionStyle,
  type AgentFocus,
  type StressResponse,
  type PerceivedValue,
  type NegotiationStyle,
} from "./matching.js";
import { createNotification } from "./messages.js";
import { insertWithSchemaFallback, updateWithSchemaFallback } from "./supabaseWrite.js";

/**
 * Agent assessment lifecycle: score the 18-question agent survey into the five
 * REQUITY dimensions, resolve the agent archetype, and persist it to Supabase.
 *
 * The dimension mapping mirrors the frontend agent assessment (agent/script.js)
 * so the backend remains the authoritative source of truth.
 */

export type AgentAnswers = Record<string | number, string>;

type DimensionContribution = Partial<{
  interactionStyle: AgentInteractionStyle;
  focus: AgentFocus;
  stressResponse: StressResponse;
  perceivedValue: PerceivedValue;
  negotiationStyle: NegotiationStyle;
}>;

const AGENT_QUESTION_MAPPING: Record<number, Record<string, DimensionContribution>> = {
  1: { A: { interactionStyle: "Motivator", focus: "Aesthetic" }, B: { interactionStyle: "Facilitator", focus: "Pragmatic" }, C: { interactionStyle: "Facilitator", focus: "Aesthetic" }, D: { interactionStyle: "Motivator", focus: "Pragmatic" } },
  2: { A: { focus: "Aesthetic" }, B: { focus: "Pragmatic" }, C: { focus: "Aesthetic" }, D: { focus: "Pragmatic" } },
  3: { A: { stressResponse: "Freeze" }, B: { stressResponse: "Fight" }, C: { stressResponse: "Flight" }, D: { stressResponse: "Fawn" } },
  4: { A: { interactionStyle: "Motivator", focus: "Aesthetic" }, B: { interactionStyle: "Facilitator", focus: "Pragmatic" }, C: { interactionStyle: "Facilitator", focus: "Aesthetic" }, D: { interactionStyle: "Motivator", focus: "Pragmatic" } },
  5: { A: { stressResponse: "Freeze" }, B: { stressResponse: "Fight" }, C: { stressResponse: "Flight" }, D: { stressResponse: "Fawn" } },
  6: { A: { perceivedValue: "Innovation" }, B: { perceivedValue: "Energy" }, C: { perceivedValue: "Authority" }, D: { perceivedValue: "Excellence" }, E: { perceivedValue: "Trust" }, F: { perceivedValue: "Insights" }, G: { perceivedValue: "Security" } },
  7: { A: { perceivedValue: "Innovation" }, B: { perceivedValue: "Energy" }, C: { perceivedValue: "Authority" }, D: { perceivedValue: "Excellence" }, E: { perceivedValue: "Trust" }, F: { perceivedValue: "Insights" }, G: { perceivedValue: "Security" } },
  8: { A: { negotiationStyle: "Competitive" }, B: { negotiationStyle: "Collaborative" }, C: { negotiationStyle: "Accommodating" }, D: { negotiationStyle: "Avoiding" }, E: { negotiationStyle: "Compromising" }, F: { negotiationStyle: "Analytical" }, G: { negotiationStyle: "Directive" }, H: { negotiationStyle: "Emotive" } },
  9: { A: { negotiationStyle: "Competitive" }, B: { negotiationStyle: "Collaborative" }, C: { negotiationStyle: "Accommodating" }, D: { negotiationStyle: "Avoiding" }, E: { negotiationStyle: "Compromising" }, F: { negotiationStyle: "Analytical" }, G: { negotiationStyle: "Directive" }, H: { negotiationStyle: "Emotive" } },
  10: { A: { stressResponse: "Freeze" }, B: { stressResponse: "Fight" }, C: { stressResponse: "Flight" }, D: { stressResponse: "Fawn" } },
  11: { A: { focus: "Aesthetic" }, B: { focus: "Pragmatic" }, C: { focus: "Aesthetic" }, D: { focus: "Pragmatic" } },
  12: { A: { focus: "Aesthetic" }, B: { focus: "Pragmatic" }, C: { focus: "Aesthetic" }, D: { focus: "Pragmatic" } },
  13: { A: { focus: "Aesthetic" }, B: { focus: "Pragmatic" }, C: { focus: "Aesthetic" }, D: { focus: "Pragmatic" } },
  14: { A: { focus: "Aesthetic" }, B: { focus: "Pragmatic" }, C: { focus: "Aesthetic" }, D: { focus: "Pragmatic" } },
  15: { A: { stressResponse: "Freeze" }, B: { stressResponse: "Fight" }, C: { stressResponse: "Flight" }, D: { stressResponse: "Fawn" } },
  16: { A: { negotiationStyle: "Competitive" }, B: { negotiationStyle: "Collaborative" }, C: { negotiationStyle: "Accommodating" }, D: { negotiationStyle: "Avoiding" }, E: { negotiationStyle: "Compromising" }, F: { negotiationStyle: "Analytical" }, G: { negotiationStyle: "Directive" }, H: { negotiationStyle: "Emotive" } },
  17: { A: { interactionStyle: "Motivator" }, B: { interactionStyle: "Facilitator" }, C: { interactionStyle: "Facilitator" }, D: { interactionStyle: "Facilitator" } },
  18: { A: { interactionStyle: "Motivator", focus: "Aesthetic" }, B: { interactionStyle: "Facilitator", focus: "Pragmatic" }, C: { interactionStyle: "Facilitator", focus: "Aesthetic" }, D: { interactionStyle: "Motivator", focus: "Pragmatic" } },
};

const ARCHETYPE_BY_TRIPLE: Record<string, string> = Object.fromEntries(
  Object.values(agentArchetypeMap).map((a) => [
    `${a.interactionStyle}-${a.focus}-${a.stressResponse}`,
    a.archetype,
  ])
);

export type AgentArchetypeResult = {
  archetype: string;
  interactionStyle: AgentInteractionStyle | "Flexible";
  focus: AgentFocus | "Flexible";
  stressResponse: StressResponse | "Flexible";
  perceivedValue: PerceivedValue | "Flexible";
  negotiationStyle: NegotiationStyle | "Flexible";
};

type Dimension = keyof DimensionContribution;

function firstOccurrence(answers: AgentAnswers, dimension: Dimension, value: string): number {
  for (let i = 1; i <= 18; i++) {
    const contribution = AGENT_QUESTION_MAPPING[i]?.[answers[i]];
    if (contribution && (contribution as Record<string, string>)[dimension] === value) return i;
  }
  return 999;
}

export function calculateAgentArchetype(answers: AgentAnswers): AgentArchetypeResult {
  const counts: Record<Dimension, Record<string, number>> = {
    interactionStyle: {},
    focus: {},
    stressResponse: {},
    perceivedValue: {},
    negotiationStyle: {},
  };

  for (const [num, answer] of Object.entries(answers)) {
    const contribution = AGENT_QUESTION_MAPPING[Number(num)]?.[answer];
    if (!contribution) continue;
    for (const [dimension, value] of Object.entries(contribution)) {
      const dim = dimension as Dimension;
      counts[dim][value as string] = (counts[dim][value as string] ?? 0) + 1;
    }
  }

  const winners: Record<string, string> = {};
  for (const dimension of Object.keys(counts) as Dimension[]) {
    const entries = Object.entries(counts[dimension]);
    entries.sort((a, b) =>
      b[1] !== a[1]
        ? b[1] - a[1]
        : firstOccurrence(answers, dimension, a[0]) - firstOccurrence(answers, dimension, b[0])
    );
    winners[dimension] = entries[0]?.[0] ?? "Flexible";
  }

  const triple = `${winners.interactionStyle}-${winners.focus}-${winners.stressResponse}`;
  return {
    // All 16 interactionStyle-focus-stressResponse combos are mapped; the
    // fallback is an approved agent archetype, never an invalid placeholder.
    archetype: ARCHETYPE_BY_TRIPLE[triple] ?? "The Collaborator",
    interactionStyle: winners.interactionStyle as AgentArchetypeResult["interactionStyle"],
    focus: winners.focus as AgentArchetypeResult["focus"],
    stressResponse: winners.stressResponse as AgentArchetypeResult["stressResponse"],
    perceivedValue: winners.perceivedValue as AgentArchetypeResult["perceivedValue"],
    negotiationStyle: winners.negotiationStyle as AgentArchetypeResult["negotiationStyle"],
  };
}

export type SubmitAgentAssessmentParams = {
  contact: { name: string; email: string; phone?: string | null; dateOfBirth?: string | null };
  answers: AgentAnswers;
  /** City/market the agent primarily works in (metadata, not scored). */
  marketCity?: string | null;
  /** Optional existing agent id (e.g. logged-in agent retaking/updating). */
  agentId?: string | null;
  /** Optional profile id to attach the agent to an auth user. */
  profileId?: string | null;
};

export type SubmitAgentAssessmentResult = AgentArchetypeResult & {
  agentId: string;
  assessmentId: string;
  marketCity: string;
};

/** Score the agent survey and save the resulting archetype + dimensions to Supabase. */
export async function submitAgentAssessment(
  params: SubmitAgentAssessmentParams
): Promise<SubmitAgentAssessmentResult> {
  const result = calculateAgentArchetype(params.answers);
  const completedAt = new Date().toISOString();
  const marketCity = (params.marketCity ?? "").trim();

  // The full, authoritative dimensions live on the `assessments` row (result)
  // and in the agent's `assessment_summary` JSON. The five scalar dimension
  // columns are written too, but ONLY persist where the live schema has them —
  // the resilient writer silently drops any column the live DB is missing
  // (e.g. a not-yet-migrated `focus`) instead of failing the whole submit.
  const summary = {
    archetype: result.archetype,
    interactionStyle: result.interactionStyle,
    focus: result.focus,
    stressResponse: result.stressResponse,
    perceivedValue: result.perceivedValue,
    negotiationStyle: result.negotiationStyle,
    marketCity,
  };

  const agentValues: Record<string, unknown> = {
    display_name: params.contact.name,
    email: params.contact.email,
    phone: params.contact.phone ?? null,
    archetype: result.archetype,
    archetype_completed_at: completedAt,
    // City/market column (dropped by the resilient writer if absent live).
    market_city: marketCity || null,
    // Optional/drift-prone scalar dimension columns (dropped if absent live).
    interaction_style: result.interactionStyle,
    focus: result.focus,
    stress_response: result.stressResponse,
    perceived_value: result.perceivedValue,
    negotiation_style: result.negotiationStyle,
    // JSON snapshot of the dimensions/answers (dropped if columns absent live).
    assessment_summary: summary,
    assessment_responses: params.answers,
    ...(params.profileId ? { profile_id: params.profileId } : {}),
  };

  let agentId = params.agentId ?? null;
  if (agentId) {
    // `archetype` is the field the dashboard routing depends on; never drop it.
    await updateWithSchemaFallback("agents", agentValues, { column: "id", value: agentId }, {
      required: ["archetype"],
    });
  } else {
    const { data } = await insertWithSchemaFallback<{ id: string }>("agents", agentValues, {
      select: "id",
      required: ["display_name", "email", "archetype"],
    });
    agentId = data.id;
  }

  const { data: assessment } = await insertWithSchemaFallback<{ id: string }>(
    "assessments",
    {
      agent_id: agentId,
      assessment_type: "agent",
      answers: params.answers,
      result,
      status: "completed",
      completed_at: completedAt,
    },
    { select: "id", required: ["assessment_type"] }
  );

  try {
    await createNotification({
      recipientProfileId: params.profileId ?? null,
      agentId,
      type: "agent_archetype_completed",
      title: "Your Agent Archetype is ready",
      body: `Your assessment is complete. Your Agent Archetype is ${result.archetype}. REQUITY will use this when reviewing future client matches.`,
    });
  } catch (error) {
    console.error("[agentAssessments] notification failed:", error);
  }

  return { ...result, agentId: agentId!, assessmentId: assessment.id, marketCity };
}
