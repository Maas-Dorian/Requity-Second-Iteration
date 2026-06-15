/**
 * REQUITY agent <-> client matching engine.
 *
 * Final Match Score weighting (see backend/docs/CURSOR_BUILD_PLAN.md):
 *   30% orientation fit
 *   25% style/focus fit
 *   25% stress-response support fit
 *   10% negotiation fit
 *   10% perceived-value fit
 */

export type ClientOrientation = "Driver" | "Collaborator";
export type ClientStyle = "Design-Focused" | "Practical";
export type StressResponse = "Freeze" | "Fight" | "Flight" | "Fawn";
export type AgentInteractionStyle = "Motivator" | "Facilitator";
export type AgentFocus = "Aesthetic" | "Pragmatic";
export type NegotiationStyle =
  | "Competitive"
  | "Collaborative"
  | "Accommodating"
  | "Avoiding"
  | "Compromising"
  | "Analytical"
  | "Directive"
  | "Emotive";
export type PerceivedValue =
  | "Innovation"
  | "Energy"
  | "Authority"
  | "Excellence"
  | "Trust"
  | "Insights"
  | "Security";

export type ClientSource = "qr" | "requity_reviewer";

export type ClientProfile = {
  id?: string;
  name?: string;
  archetype: string;
  orientation: ClientOrientation;
  style: ClientStyle;
  stressResponse: StressResponse;
  source?: ClientSource;
};

export type AgentProfile = {
  id: string;
  name: string;
  archetype: string;
  interactionStyle: AgentInteractionStyle;
  focus: AgentFocus;
  stressResponse: StressResponse;
  perceivedValue: PerceivedValue;
  negotiationStyle: NegotiationStyle;
};

export type MatchLabel = "Excellent Fit" | "Strong Fit" | "Good Fit" | "Review Carefully";

export type MatchResult = {
  agent: AgentProfile;
  score: number;
  label: MatchLabel;
  reason: string;
  sourceBehavior: string;
};

export const MATCH_WEIGHTS = {
  orientation: 0.3,
  style: 0.25,
  stress: 0.25,
  negotiation: 0.1,
  value: 0.1,
} as const;

export const clientArchetypeMap: Record<string, Omit<ClientProfile, "id" | "name" | "source">> = {
  "The Visionary": { archetype: "The Visionary", orientation: "Driver", style: "Design-Focused", stressResponse: "Freeze" },
  "The Trailblazer": { archetype: "The Trailblazer", orientation: "Driver", style: "Design-Focused", stressResponse: "Fight" },
  "The Dreamchaser": { archetype: "The Dreamchaser", orientation: "Driver", style: "Design-Focused", stressResponse: "Flight" },
  "The Inspirer": { archetype: "The Inspirer", orientation: "Driver", style: "Design-Focused", stressResponse: "Fawn" },
  "The Strategist": { archetype: "The Strategist", orientation: "Driver", style: "Practical", stressResponse: "Freeze" },
  "The Closer": { archetype: "The Closer", orientation: "Driver", style: "Practical", stressResponse: "Fight" },
  "The Pathfinder": { archetype: "The Pathfinder", orientation: "Driver", style: "Practical", stressResponse: "Flight" },
  "The Advocate": { archetype: "The Advocate", orientation: "Driver", style: "Practical", stressResponse: "Fawn" },
  "The Curator": { archetype: "The Curator", orientation: "Collaborator", style: "Design-Focused", stressResponse: "Freeze" },
  "The Spark": { archetype: "The Spark", orientation: "Collaborator", style: "Design-Focused", stressResponse: "Fight" },
  "The Explorer": { archetype: "The Explorer", orientation: "Collaborator", style: "Design-Focused", stressResponse: "Flight" },
  "The Harmonizer": { archetype: "The Harmonizer", orientation: "Collaborator", style: "Design-Focused", stressResponse: "Fawn" },
  "The Organizer": { archetype: "The Organizer", orientation: "Collaborator", style: "Practical", stressResponse: "Freeze" },
  "The Producer": { archetype: "The Producer", orientation: "Collaborator", style: "Practical", stressResponse: "Fight" },
  "The Navigator": { archetype: "The Navigator", orientation: "Collaborator", style: "Practical", stressResponse: "Flight" },
  "The Supporter": { archetype: "The Supporter", orientation: "Collaborator", style: "Practical", stressResponse: "Fawn" },
};

export const agentArchetypeMap: Record<string, Omit<AgentProfile, "id" | "name">> = {
  "The Creative Guide": { archetype: "The Creative Guide", interactionStyle: "Motivator", focus: "Aesthetic", stressResponse: "Freeze", perceivedValue: "Innovation", negotiationStyle: "Analytical" },
  "The Trendsetter": { archetype: "The Trendsetter", interactionStyle: "Motivator", focus: "Aesthetic", stressResponse: "Fight", perceivedValue: "Energy", negotiationStyle: "Directive" },
  "The Stylist": { archetype: "The Stylist", interactionStyle: "Motivator", focus: "Aesthetic", stressResponse: "Flight", perceivedValue: "Excellence", negotiationStyle: "Emotive" },
  "The Cheerleader": { archetype: "The Cheerleader", interactionStyle: "Motivator", focus: "Aesthetic", stressResponse: "Fawn", perceivedValue: "Energy", negotiationStyle: "Accommodating" },
  "The Analyst": { archetype: "The Analyst", interactionStyle: "Motivator", focus: "Pragmatic", stressResponse: "Freeze", perceivedValue: "Insights", negotiationStyle: "Analytical" },
  "The Deal Maker": { archetype: "The Deal Maker", interactionStyle: "Motivator", focus: "Pragmatic", stressResponse: "Fight", perceivedValue: "Authority", negotiationStyle: "Competitive" },
  "The Adapter": { archetype: "The Adapter", interactionStyle: "Motivator", focus: "Pragmatic", stressResponse: "Flight", perceivedValue: "Innovation", negotiationStyle: "Compromising" },
  "The Agent Supporter": { archetype: "The Agent Supporter", interactionStyle: "Motivator", focus: "Pragmatic", stressResponse: "Fawn", perceivedValue: "Trust", negotiationStyle: "Accommodating" },
  "The Refiner": { archetype: "The Refiner", interactionStyle: "Facilitator", focus: "Aesthetic", stressResponse: "Freeze", perceivedValue: "Excellence", negotiationStyle: "Analytical" },
  "The Catalyst": { archetype: "The Catalyst", interactionStyle: "Facilitator", focus: "Aesthetic", stressResponse: "Fight", perceivedValue: "Innovation", negotiationStyle: "Directive" },
  "The Observer": { archetype: "The Observer", interactionStyle: "Facilitator", focus: "Aesthetic", stressResponse: "Flight", perceivedValue: "Insights", negotiationStyle: "Avoiding" },
  "The Encourager": { archetype: "The Encourager", interactionStyle: "Facilitator", focus: "Aesthetic", stressResponse: "Fawn", perceivedValue: "Trust", negotiationStyle: "Emotive" },
  "The Coordinator": { archetype: "The Coordinator", interactionStyle: "Facilitator", focus: "Pragmatic", stressResponse: "Freeze", perceivedValue: "Security", negotiationStyle: "Analytical" },
  "The Agent Producer": { archetype: "The Agent Producer", interactionStyle: "Facilitator", focus: "Pragmatic", stressResponse: "Fight", perceivedValue: "Excellence", negotiationStyle: "Directive" },
  "The Adjuster": { archetype: "The Adjuster", interactionStyle: "Facilitator", focus: "Pragmatic", stressResponse: "Flight", perceivedValue: "Security", negotiationStyle: "Compromising" },
  "The Collaborator": { archetype: "The Collaborator", interactionStyle: "Facilitator", focus: "Pragmatic", stressResponse: "Fawn", perceivedValue: "Trust", negotiationStyle: "Collaborative" },
};

/** Best primary agent->client archetype pairings and their headline percentages. */
export const primaryMatchPercentages: Record<string, { clientArchetype: string; percentage: number }> = {
  "The Creative Guide": { clientArchetype: "The Visionary", percentage: 99 },
  "The Trendsetter": { clientArchetype: "The Trailblazer", percentage: 99 },
  "The Stylist": { clientArchetype: "The Dreamchaser", percentage: 94 },
  "The Cheerleader": { clientArchetype: "The Inspirer", percentage: 95 },
  "The Analyst": { clientArchetype: "The Strategist", percentage: 99 },
  "The Deal Maker": { clientArchetype: "The Closer", percentage: 99 },
  "The Adapter": { clientArchetype: "The Pathfinder", percentage: 94 },
  "The Agent Supporter": { clientArchetype: "The Advocate", percentage: 93 },
  "The Refiner": { clientArchetype: "The Curator", percentage: 97 },
  "The Catalyst": { clientArchetype: "The Spark", percentage: 95 },
  "The Observer": { clientArchetype: "The Explorer", percentage: 92 },
  "The Encourager": { clientArchetype: "The Harmonizer", percentage: 97 },
  "The Coordinator": { clientArchetype: "The Organizer", percentage: 97 },
  "The Agent Producer": { clientArchetype: "The Producer", percentage: 95 },
  "The Adjuster": { clientArchetype: "The Navigator", percentage: 96 },
  "The Collaborator": { clientArchetype: "The Supporter", percentage: 97 },
};

export function scoreOrientationFit(client: ClientProfile, agent: AgentProfile): number {
  if (client.orientation === "Driver" && agent.interactionStyle === "Motivator") return 100;
  if (client.orientation === "Collaborator" && agent.interactionStyle === "Facilitator") return 100;
  return 65;
}

export function scoreStyleFit(client: ClientProfile, agent: AgentProfile): number {
  if (client.style === "Design-Focused" && agent.focus === "Aesthetic") return 100;
  if (client.style === "Practical" && agent.focus === "Pragmatic") return 100;
  return 60;
}

export function scoreStressFit(client: ClientProfile, agent: AgentProfile): number {
  const matrix: Record<StressResponse, Record<StressResponse, number>> = {
    Freeze: { Freeze: 95, Fight: 65, Flight: 70, Fawn: 85 },
    Fight: { Freeze: 75, Fight: 95, Flight: 60, Fawn: 70 },
    Flight: { Freeze: 70, Fight: 60, Flight: 90, Fawn: 85 },
    Fawn: { Freeze: 80, Fight: 60, Flight: 75, Fawn: 95 },
  };
  return matrix[client.stressResponse][agent.stressResponse];
}

export function scoreNegotiationFit(client: ClientProfile, agent: AgentProfile): number {
  if (client.orientation === "Driver") {
    if (["Directive", "Competitive", "Analytical"].includes(agent.negotiationStyle)) return 100;
    if (["Collaborative", "Compromising"].includes(agent.negotiationStyle)) return 80;
    return 60;
  }
  if (["Collaborative", "Accommodating", "Emotive"].includes(agent.negotiationStyle)) return 100;
  if (["Compromising", "Analytical"].includes(agent.negotiationStyle)) return 80;
  return 60;
}

export function scoreValueFit(client: ClientProfile, agent: AgentProfile): number {
  if (client.style === "Design-Focused") {
    if (["Innovation", "Energy", "Excellence"].includes(agent.perceivedValue)) return 100;
    if (["Insights", "Trust"].includes(agent.perceivedValue)) return 80;
    return 65;
  }
  if (["Security", "Insights", "Authority", "Excellence"].includes(agent.perceivedValue)) return 100;
  if (["Trust", "Innovation"].includes(agent.perceivedValue)) return 80;
  return 65;
}

export function labelForScore(score: number): MatchLabel {
  if (score >= 90) return "Excellent Fit";
  if (score >= 80) return "Strong Fit";
  if (score >= 70) return "Good Fit";
  return "Review Carefully";
}

export function calculateAgentClientMatch(client: ClientProfile, agent: AgentProfile): MatchResult {
  const score = Math.round(
    scoreOrientationFit(client, agent) * MATCH_WEIGHTS.orientation +
      scoreStyleFit(client, agent) * MATCH_WEIGHTS.style +
      scoreStressFit(client, agent) * MATCH_WEIGHTS.stress +
      scoreNegotiationFit(client, agent) * MATCH_WEIGHTS.negotiation +
      scoreValueFit(client, agent) * MATCH_WEIGHTS.value
  );
  return {
    agent,
    score,
    label: labelForScore(score),
    reason: buildMatchReason(client, agent),
    sourceBehavior:
      client.source === "qr"
        ? "QR-code clients stay inside the agent dashboard and do not enter the REQUITY reviewer queue."
        : "REQUITY reviewer matches require reviewer approval before assignment.",
  };
}

export function rankAgentsForClient(client: ClientProfile, agents: AgentProfile[]): MatchResult[] {
  return agents
    .map((agent) => calculateAgentClientMatch(client, agent))
    .sort((a, b) => b.score - a.score);
}

export function buildMatchReason(client: ClientProfile, agent: AgentProfile): string {
  const orientation =
    client.orientation === "Driver"
      ? "This client prefers decisive movement and clear direction."
      : "This client prefers collaboration, trust, and shared decision-making.";
  const style =
    client.style === "Design-Focused"
      ? "They respond well to visual presentation, possibility, and emotional connection to the property."
      : "They respond well to practical details, structure, financial clarity, and functional value.";
  const stress: Record<StressResponse, string> = {
    Freeze: "When overwhelmed, they need calm structure, fewer options, and clear next steps.",
    Fight: "When stressed, they need direct communication, fast solutions, and confident guidance.",
    Flight: "When stressed, they may avoid pressure, so they need flexibility and gentle forward movement.",
    Fawn: "When stressed, they need reassurance, relational safety, and steady support.",
  };
  return `${orientation} ${style} ${stress[client.stressResponse]} ${agent.name} is a strong fit because their ${agent.archetype} style supports those needs.`;
}
