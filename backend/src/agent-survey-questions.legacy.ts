export interface AgentSurveyQuestion {
  question: string;
  options: {
    value: string;
    text: string;
    description?: string;
  }[];
}

export const agentSurveyQuestions: AgentSurveyQuestion[] = [
  {
    question: "Your approach to client relationships is:",
    options: [
      { value: "A", text: "Leading with vision and decisive action" },
      { value: "B", text: "Facilitating collaborative decision-making" },
      { value: "C", text: "Prioritizing emotional connection" },
      { value: "D", text: "Focusing on practical outcomes" }
    ]
  },
  {
    question: "When presenting a property, you emphasize:",
    options: [
      { value: "A", text: "Design aesthetics and \"wow factor\"" },
      { value: "B", text: "Investment potential and ROI data" },
      { value: "C", text: "Storytelling about lifestyle" },
      { value: "D", text: "Functional features and cost analysis" }
    ]
  },
  {
    question: "Under negotiation pressure, you:",
    options: [
      { value: "A", text: "Seek step-by-step guidance" },
      { value: "B", text: "Push for immediate solutions" },
      { value: "C", text: "Withdraw to reassess" },
      { value: "D", text: "Prioritize harmony" }
    ]
  },
  {
    question: "Your clients describe you as:",
    options: [
      { value: "A", text: "A visionary who inspires action" },
      { value: "B", text: "A trusted advisor who listens" },
      { value: "C", text: "A creative problem-solver" },
      { value: "D", text: "A results-driven strategist" }
    ]
  },
  {
    question: "When a deal stalls, you first:",
    options: [
      { value: "A", text: "Analyze all options methodically" },
      { value: "B", text: "Challenge objections head-on" },
      { value: "C", text: "Suggest pausing to rethink" },
      { value: "D", text: "Offer concessions to rebuild rapport" }
    ]
  },
  {
    question: "Colleagues say your superpower is:",
    options: [
      { value: "A", text: "Breakthrough ideas" },
      { value: "B", text: "Energizing others" },
      { value: "C", text: "Commanding authority" },
      { value: "D", text: "Upholding excellence" },
      { value: "E", text: "Building trust" },
      { value: "F", text: "Intriguing insights" },
      { value: "G", text: "Risk mitigation" }
    ]
  },
  {
    question: "Clients hire you because you:",
    options: [
      { value: "A", text: "Turn complexity into opportunity" },
      { value: "B", text: "Make transactions exciting" },
      { value: "C", text: "Exude confidence in high-stakes deals" },
      { value: "D", text: "Deliver flawless execution" },
      { value: "E", text: "Build security" },
      { value: "F", text: "Reveal unexpected insights" },
      { value: "G", text: "Anticipate pitfalls" }
    ]
  },
  {
    question: "Your natural negotiation approach is:",
    options: [
      { value: "A", text: "Competitive: \"Win the best terms\"" },
      { value: "B", text: "Collaborative: \"Find mutual wins\"" },
      { value: "C", text: "Accommodating: \"Preserve relationships\"" },
      { value: "D", text: "Avoiding: \"Delay for more data\"" },
      { value: "E", text: "Compromising: \"Split differences\"" },
      { value: "F", text: "Analytical: \"Leverage data\"" },
      { value: "G", text: "Directive: \"Take charge\"" },
      { value: "H", text: "Emotive: \"Appeal emotionally\"" }
    ]
  },
  {
    question: "During tough negotiations, you:",
    options: [
      { value: "A", text: "Hold firm on core demands" },
      { value: "B", text: "Brainstorm creative solutions" },
      { value: "C", text: "Yield to maintain trust" },
      { value: "D", text: "Table the discussion" },
      { value: "E", text: "Propose middle-ground offers" },
      { value: "F", text: "Present data-driven arguments" },
      { value: "G", text: "Control the conversation" },
      { value: "H", text: "Share stories to build rapport" }
    ]
  },
  {
    question: "When overwhelmed, you:",
    options: [
      { value: "A", text: "Freeze until priorities are clear" },
      { value: "B", text: "Ruthlessly prioritize tasks" },
      { value: "C", text: "Delegate and step back" },
      { value: "D", text: "Check on others' stress levels" }
    ]
  },
  {
    question: "Your marketing strength is:",
    options: [
      { value: "A", text: "Stunning visuals and storytelling" },
      { value: "B", text: "ROI charts and analytics" },
      { value: "C", text: "Innovative concepts" },
      { value: "D", text: "Practical feature highlights" }
    ]
  },
  {
    question: "You justify pricing with:",
    options: [
      { value: "A", text: "Design uniqueness" },
      { value: "B", text: "Comparable sales data" },
      { value: "C", text: "Emotional appeal" },
      { value: "D", text: "Investment potential" }
    ]
  },
  {
    question: "Your open houses emphasize:",
    options: [
      { value: "A", text: "Staging and ambiance" },
      { value: "B", text: "Inspection reports" },
      { value: "C", text: "Themed experiences" },
      { value: "D", text: "Utility cost savings" }
    ]
  },
  {
    question: "You build trust by:",
    options: [
      { value: "A", text: "Personal connection" },
      { value: "B", text: "Consistent results" },
      { value: "C", text: "Vulnerability" },
      { value: "D", text: "Data transparency" }
    ]
  },
  {
    question: "Under stress, your communication becomes:",
    options: [
      { value: "A", text: "More structured" },
      { value: "B", text: "More assertive" },
      { value: "C", text: "More withdrawn" },
      { value: "D", text: "More reassuring" }
    ]
  },
  {
    question: "Your negotiation strength is:",
    options: [
      { value: "A", text: "Applying pressure" },
      { value: "B", text: "Finding win-wins" },
      { value: "C", text: "Making concessions" },
      { value: "D", text: "Information gathering" },
      { value: "E", text: "Quick compromises" },
      { value: "F", text: "Fact-based arguments" },
      { value: "G", text: "Decisive action" },
      { value: "H", text: "Emotional connection" }
    ]
  },
  {
    question: "When receiving feedback, you prefer:",
    options: [
      { value: "A", text: "Direct actionable steps" },
      { value: "B", text: "Encouraging reinforcement" },
      { value: "C", text: "Detailed written reports" },
      { value: "D", text: "Private discussions" }
    ]
  },
  {
    question: "Your value proposition is:",
    options: [
      { value: "A", text: "\"I inspire decisive action\"" },
      { value: "B", text: "\"I build collaborative solutions\"" },
      { value: "C", text: "\"I create memorable experiences\"" },
      { value: "D", text: "\"I deliver measurable results\"" }
    ]
  }
];

// Answer mapping for determining agent archetype dimensions
export const agentAnswerMapping: Record<string, Record<string, Record<string, string>>> = {
  // Question 1: Interaction Style, Focus
  "1": {
    "A": { "interactionStyle": "Motivator", "focus": "Aesthetic" },
    "B": { "interactionStyle": "Facilitator", "focus": "Pragmatic" },
    "C": { "interactionStyle": "Facilitator", "focus": "Aesthetic" },
    "D": { "interactionStyle": "Motivator", "focus": "Pragmatic" }
  },
  // Question 2: Focus
  "2": {
    "A": { "focus": "Aesthetic" },
    "B": { "focus": "Pragmatic" },
    "C": { "focus": "Aesthetic" },
    "D": { "focus": "Pragmatic" }
  },
  // Question 3: Stress Response
  "3": {
    "A": { "stressResponse": "Freeze" },
    "B": { "stressResponse": "Fight" },
    "C": { "stressResponse": "Flight" },
    "D": { "stressResponse": "Fawn" }
  },
  // Question 4: Interaction Style, Focus
  "4": {
    "A": { "interactionStyle": "Motivator", "focus": "Aesthetic" },
    "B": { "interactionStyle": "Facilitator", "focus": "Pragmatic" },
    "C": { "interactionStyle": "Facilitator", "focus": "Aesthetic" },
    "D": { "interactionStyle": "Motivator", "focus": "Pragmatic" }
  },
  // Question 5: Stress Response
  "5": {
    "A": { "stressResponse": "Freeze" },
    "B": { "stressResponse": "Fight" },
    "C": { "stressResponse": "Flight" },
    "D": { "stressResponse": "Fawn" }
  },
  // Question 6: Perceived Value
  "6": {
    "A": { "perceivedValue": "Innovation" },
    "B": { "perceivedValue": "Energy" },
    "C": { "perceivedValue": "Authority" },
    "D": { "perceivedValue": "Excellence" },
    "E": { "perceivedValue": "Trust" },
    "F": { "perceivedValue": "Insights" },
    "G": { "perceivedValue": "Security" }
  },
  // Question 7: Perceived Value
  "7": {
    "A": { "perceivedValue": "Innovation" },
    "B": { "perceivedValue": "Energy" },
    "C": { "perceivedValue": "Authority" },
    "D": { "perceivedValue": "Excellence" },
    "E": { "perceivedValue": "Trust" },
    "F": { "perceivedValue": "Insights" },
    "G": { "perceivedValue": "Security" }
  },
  // Question 8: Negotiation Style
  "8": {
    "A": { "negotiationStyle": "Competitive" },
    "B": { "negotiationStyle": "Collaborative" },
    "C": { "negotiationStyle": "Accommodating" },
    "D": { "negotiationStyle": "Avoiding" },
    "E": { "negotiationStyle": "Compromising" },
    "F": { "negotiationStyle": "Analytical" },
    "G": { "negotiationStyle": "Directive" },
    "H": { "negotiationStyle": "Emotive" }
  },
  // Question 9: Negotiation Style
  "9": {
    "A": { "negotiationStyle": "Competitive" },
    "B": { "negotiationStyle": "Collaborative" },
    "C": { "negotiationStyle": "Accommodating" },
    "D": { "negotiationStyle": "Avoiding" },
    "E": { "negotiationStyle": "Compromising" },
    "F": { "negotiationStyle": "Analytical" },
    "G": { "negotiationStyle": "Directive" },
    "H": { "negotiationStyle": "Emotive" }
  },
  // Question 10: Stress Response
  "10": {
    "A": { "stressResponse": "Freeze" },
    "B": { "stressResponse": "Fight" },
    "C": { "stressResponse": "Flight" },
    "D": { "stressResponse": "Fawn" }
  },
  // Question 11: Focus
  "11": {
    "A": { "focus": "Aesthetic" },
    "B": { "focus": "Pragmatic" },
    "C": { "focus": "Aesthetic" },
    "D": { "focus": "Pragmatic" }
  },
  // Question 12: Focus
  "12": {
    "A": { "focus": "Aesthetic" },
    "B": { "focus": "Pragmatic" },
    "C": { "focus": "Aesthetic" },
    "D": { "focus": "Pragmatic" }
  },
  // Question 13: Focus
  "13": {
    "A": { "focus": "Aesthetic" },
    "B": { "focus": "Pragmatic" },
    "C": { "focus": "Aesthetic" },
    "D": { "focus": "Pragmatic" }
  },
  // Question 14: Focus
  "14": {
    "A": { "focus": "Aesthetic" },
    "B": { "focus": "Pragmatic" },
    "C": { "focus": "Aesthetic" },
    "D": { "focus": "Pragmatic" }
  },
  // Question 15: Stress Response
  "15": {
    "A": { "stressResponse": "Freeze" },
    "B": { "stressResponse": "Fight" },
    "C": { "stressResponse": "Flight" },
    "D": { "stressResponse": "Fawn" }
  },
  // Question 16: Negotiation Style
  "16": {
    "A": { "negotiationStyle": "Competitive" },
    "B": { "negotiationStyle": "Collaborative" },
    "C": { "negotiationStyle": "Accommodating" },
    "D": { "negotiationStyle": "Avoiding" },
    "E": { "negotiationStyle": "Compromising" },
    "F": { "negotiationStyle": "Analytical" },
    "G": { "negotiationStyle": "Directive" },
    "H": { "negotiationStyle": "Emotive" }
  },
  // Question 17: Interaction Style
  "17": {
    "A": { "interactionStyle": "Motivator" },
    "B": { "interactionStyle": "Facilitator" },
    "C": { "interactionStyle": "Facilitator" },
    "D": { "interactionStyle": "Facilitator" }
  },
  // Question 18: Interaction Style, Focus
  "18": {
    "A": { "interactionStyle": "Motivator", "focus": "Aesthetic" },
    "B": { "interactionStyle": "Facilitator", "focus": "Pragmatic" },
    "C": { "interactionStyle": "Facilitator", "focus": "Aesthetic" },
    "D": { "interactionStyle": "Motivator", "focus": "Pragmatic" }
  }
};

// Map the 16 agent archetypes to their characteristics
export const agentArchetypeMatrix: Record<string, string> = {
  "Motivator-Aesthetic-Freeze": "The Creative Guide",
  "Motivator-Aesthetic-Fight": "The Trendsetter", 
  "Motivator-Aesthetic-Flight": "The Stylist",
  "Motivator-Aesthetic-Fawn": "The Cheerleader",
  "Motivator-Pragmatic-Freeze": "The Analyst",
  "Motivator-Pragmatic-Fight": "The Deal Maker",
  "Motivator-Pragmatic-Flight": "The Adapter",
  "Motivator-Pragmatic-Fawn": "The Supporter",
  "Facilitator-Aesthetic-Freeze": "The Refiner",
  "Facilitator-Aesthetic-Fight": "The Catalyst",
  "Facilitator-Aesthetic-Flight": "The Observer",
  "Facilitator-Aesthetic-Fawn": "The Encourager",
  "Facilitator-Pragmatic-Freeze": "The Coordinator",
  "Facilitator-Pragmatic-Fight": "The Producer",
  "Facilitator-Pragmatic-Flight": "The Adjuster",
  "Facilitator-Pragmatic-Fawn": "The Collaborator"
};

export interface AgentArchetypeResult {
  archetype: string;
  interactionStyle: string;
  focus: string;
  stressResponse: string;
  perceivedValue: string;
  negotiationStyle: string;
}

// Function to determine agent archetype from answers
export function getAgentArchetypeFromAnswers(answers: Record<string, string>): AgentArchetypeResult {
  const dimensionCounts: Record<string, Record<string, number>> = {
    interactionStyle: {},
    focus: {},
    stressResponse: {},
    perceivedValue: {},
    negotiationStyle: {}
  };

  // Count occurrences of each dimension value
  Object.entries(answers).forEach(([questionNum, answer]) => {
    const mapping = agentAnswerMapping[questionNum]?.[answer];
    if (mapping) {
      Object.entries(mapping).forEach(([dimension, value]) => {
        if (!dimensionCounts[dimension][value]) {
          dimensionCounts[dimension][value] = 0;
        }
        dimensionCounts[dimension][value]++;
      });
    }
  });

  // Get the most frequent value for each dimension
  const result: Record<string, string> = {};
  Object.entries(dimensionCounts).forEach(([dimension, counts]) => {
    const sortedValues = Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // Sort by count descending
      // Tie-breaker: earliest occurrence (by question order)
      const firstOccurrenceA = findFirstOccurrence(dimension, a[0], answers);
      const firstOccurrenceB = findFirstOccurrence(dimension, b[0], answers);
      return firstOccurrenceA - firstOccurrenceB;
    });
    result[dimension] = sortedValues[0]?.[0] || '';
  });

  // Generate archetype key and lookup display name
  const archetypeKey = `${result.interactionStyle}-${result.focus}-${result.stressResponse}`;
  const archetype = agentArchetypeMatrix[archetypeKey] || "Unknown Agent Type";

  return {
    archetype,
    interactionStyle: result.interactionStyle,
    focus: result.focus,
    stressResponse: result.stressResponse,
    perceivedValue: result.perceivedValue,
    negotiationStyle: result.negotiationStyle
  };
}

// Helper function to find first occurrence of a dimension value
function findFirstOccurrence(dimension: string, value: string, answers: Record<string, string>): number {
  for (let i = 1; i <= 18; i++) {
    const mapping = agentAnswerMapping[i.toString()]?.[answers[i.toString()]];
    if (mapping && mapping[dimension] === value) {
      return i;
    }
  }
  return 999; // Fallback for no occurrence found
}