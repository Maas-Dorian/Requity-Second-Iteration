/**
 * REQUITY canonical archetype source of truth.
 *
 * This module is the single, authoritative definition for BOTH systems:
 *   1. CLIENT archetypes  (16 approved names)
 *   2. AGENT  archetypes  (16 approved names)
 *
 * Some names overlap by string ("The Producer", "The Supporter") but they are
 * SEPARATE archetypes kept apart by context (client vs. agent). Never mix client
 * explanations into agent explanations.
 *
 * All wording in CLIENT_ARCHETYPE_DETAILS and CLIENT_GUIDELINES is the approved
 * source copy and must not be paraphrased.
 */

import type {
  ClientOrientation,
  ClientStyle,
  StressResponse,
  AgentInteractionStyle,
  AgentFocus,
} from "./matching.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurveyQuestion {
  question: string;
  options: {
    value: string;
    text: string;
    description?: string;
  }[];
}

export interface ArchetypeResult {
  archetype: string;
  motivations: string[];
  orientation: string;
  style: string;
  stressResponse: string;
}

export interface ArchetypeGuidelines {
  buyer: {
    approaches: string[];
    avoid: string;
  };
  seller: {
    approaches: string[];
    avoid: string;
  };
  simultaneous: {
    approaches: string[];
    avoid: string;
  };
  communication: {
    recommended: string[];
    avoid: string[];
  };
}

// ---------------------------------------------------------------------------
// Approved archetype name lists (the ONLY user-facing archetypes)
// ---------------------------------------------------------------------------

export const CLIENT_ARCHETYPES = [
  "The Visionary",
  "The Trailblazer",
  "The Dreamchaser",
  "The Inspirer",
  "The Strategist",
  "The Closer",
  "The Pathfinder",
  "The Advocate",
  "The Curator",
  "The Spark",
  "The Explorer",
  "The Harmonizer",
  "The Organizer",
  "The Producer",
  "The Navigator",
  "The Supporter",
] as const;

export const AGENT_ARCHETYPES = [
  "The Creative Guide",
  "The Trendsetter",
  "The Stylist",
  "The Cheerleader",
  "The Analyst",
  "The Deal Maker",
  "The Adapter",
  "The Supporter",
  "The Refiner",
  "The Catalyst",
  "The Observer",
  "The Encourager",
  "The Coordinator",
  "The Producer",
  "The Adjuster",
  "The Collaborator",
] as const;

// ---------------------------------------------------------------------------
// CLIENT survey questions (approved source content)
// ---------------------------------------------------------------------------

export const surveyQuestions: SurveyQuestion[] = [
  {
    question: "What's your primary motivation for this move?",
    options: [
      { value: "just_me", text: "Career or lifestyle change", description: "New job, retirement, or life transition" },
      { value: "partner_spouse", text: "Family growth or changes", description: "Marriage, kids, or family situation" },
      { value: "family", text: "Better location or amenities", description: "Schools, neighborhood, or convenience" },
      { value: "other", text: "Investment or financial reasons", description: "Building wealth or downsizing costs" },
    ],
  },
  {
    question: "How do you like to make decisions?",
    options: [
      { value: "decide_quickly", text: "I prefer to decide quickly and confidently", description: "I make fast, confident decisions" },
      { value: "discuss_options", text: "I like to discuss options with others before deciding", description: "I value input from others" },
      { value: "someone_guide", text: "I prefer someone else to guide me", description: "I like expert guidance" },
      { value: "consider_possibilities", text: "I need time to consider all possibilities", description: "I take time to evaluate options" },
    ],
  },
  {
    question: "When you picture your dream home, what's most important?",
    options: [
      { value: "design_aesthetics", text: "Design/aesthetics", description: "Beautiful, stylish design matters most" },
      { value: "practical_features", text: "Practical features/functionality", description: "Function over form" },
      { value: "space_layout", text: "Space/layout", description: "How the space flows and works" },
      { value: "affordability", text: "Affordability", description: "Getting the best value for money" },
      { value: "location", text: "Location", description: "The right neighborhood and area" },
    ],
  },
  {
    question: "If something unexpected comes up, what helps you most?",
    options: [
      { value: "clear_guidance", text: "Clear, step-by-step guidance", description: "I need structured support" },
      { value: "information_clarity", text: "Information and clarity", description: "I want to understand what's happening" },
      { value: "quick_solutions", text: "Quick solutions and action", description: "Let's fix it fast and move on" },
      { value: "clear_plan", text: "A clear plan", description: "Show me the path forward" },
      { value: "space_time", text: "Space and time to process", description: "I need time to think through it" },
      { value: "distraction_humor", text: "Distraction or humor", description: "Help me step back from the stress" },
      { value: "extra_reassurance", text: "Extra reassurance and support", description: "I need emotional support" },
      { value: "encouragement", text: "Encouragement and support", description: "Positive reinforcement helps me cope" },
    ],
  },
  {
    question: "What size property are you most interested in?",
    options: [
      { value: "clear_guidance", text: "Studio or 1 bedroom", description: "Compact and efficient living" },
      { value: "information_clarity", text: "2-3 bedrooms", description: "Perfect for small families or couples" },
      { value: "quick_solutions", text: "4-5 bedrooms", description: "Spacious family home" },
      { value: "clear_plan", text: "6+ bedrooms", description: "Large estate or multi-generational living" },
      { value: "space_process", text: "Flexible based on value", description: "Size depends on the deal" },
      { value: "distraction_humor", text: "Land or acreage", description: "Rural or development opportunity" },
      { value: "extra_reassurance", text: "Commercial property", description: "Business or investment property" },
      { value: "encouragement", text: "Not sure yet", description: "Still exploring options" },
    ],
  },
  {
    question: "In your ideal experience, you would:",
    options: [
      { value: "lead_process", text: "Lead the process and make quick decisions", description: "I want to drive the timeline" },
      { value: "collaborate_team", text: "Collaborate closely with your agent and others", description: "Teamwork makes it better" },
      { value: "guided_expert", text: "Be guided by an expert you trust", description: "I want professional leadership" },
      { value: "thorough_research", text: "Do thorough research before each step", description: "Knowledge is power" },
    ],
  },
  {
    question: "When viewing properties, you focus on:",
    options: [
      { value: "visual_appeal", text: "Visual appeal and design elements", description: "Beauty and style catch my eye" },
      { value: "practical_aspects", text: "Practical aspects and functionality", description: "How well does it work for my needs" },
      { value: "investment_value", text: "Investment potential and value", description: "Will this be a good financial decision" },
      { value: "emotional_connection", text: "How the space makes you feel", description: "Does it feel like home" },
    ],
  },
  {
    question: "Your communication preference is:",
    options: [
      { value: "frequent_updates", text: "Frequent updates and quick responses", description: "Keep me in the loop constantly" },
      { value: "scheduled_checkins", text: "Scheduled check-ins at key milestones", description: "Regular but structured communication" },
      { value: "as_needed", text: "Communication only when needed", description: "Don't over-communicate with me" },
      { value: "detailed_explanations", text: "Detailed explanations of each step", description: "Help me understand everything" },
    ],
  },
  {
    question: "When facing a difficult decision, you:",
    options: [
      { value: "trust_instincts", text: "Trust your instincts and decide", description: "My gut usually knows" },
      { value: "seek_advice", text: "Seek advice from trusted people", description: "Others help me see clearly" },
      { value: "research_thoroughly", text: "Research thoroughly before deciding", description: "I need all the facts" },
      { value: "avoid_postpone", text: "Sometimes avoid or postpone the decision", description: "Tough choices are stressful" },
    ],
  },
  {
    question: "Your biggest concern in a transaction is:",
    options: [
      { value: "making_mistake", text: "Making the wrong choice", description: "What if I regret this decision" },
      { value: "process_delays", text: "Delays in the process", description: "I want things to move smoothly" },
      { value: "financial_aspects", text: "The financial aspects", description: "Money matters are stressful" },
      { value: "relationship_conflicts", text: "Conflicts with others involved", description: "I want everyone to get along" },
    ],
  },
  {
    question: "You feel most confident when:",
    options: [
      { value: "in_control", text: "You're in control of the situation", description: "I lead, things go well" },
      { value: "team_support", text: "You have a strong team supporting you", description: "Together we're stronger" },
      { value: "well_informed", text: "You're well-informed about all options", description: "Knowledge gives me confidence" },
      { value: "trusted_guidance", text: "You have trusted guidance", description: "Expert advice reassures me" },
    ],
  },
  {
    question: "In negotiations, you prefer to:",
    options: [
      { value: "direct_assertive", text: "Be direct and assertive", description: "Say what I want clearly" },
      { value: "collaborative_winwin", text: "Find collaborative win-win solutions", description: "Everyone should benefit" },
      { value: "agent_handle", text: "Let your agent handle most of it", description: "That's what professionals are for" },
      { value: "careful_strategic", text: "Be careful and strategic", description: "Think through every move" },
    ],
  },
  {
    question: "When things don't go as planned, you:",
    options: [
      { value: "take_charge", text: "Take charge and find solutions", description: "I'll fix this myself" },
      { value: "work_together", text: "Work with others to adjust the plan", description: "Let's solve this together" },
      { value: "need_reassurance", text: "Need reassurance that it will work out", description: "Tell me it's going to be okay" },
      { value: "step_back", text: "Step back and reassess", description: "I need to process this change" },
    ],
  },
  {
    question: "Your timeline preference is:",
    options: [
      { value: "asap", text: "As soon as possible", description: "Speed is important to me" },
      { value: "steady_pace", text: "A steady, predictable pace", description: "Consistent progress works best" },
      { value: "flexible_timing", text: "Flexible timing based on circumstances", description: "Let's adapt as we go" },
      { value: "no_rush", text: "No rush - take the time needed", description: "Good things take time" },
    ],
  },
  {
    question: "You learn best through:",
    options: [
      { value: "doing_experiencing", text: "Doing and experiencing", description: "Hands-on learning works for me" },
      { value: "visual_materials", text: "Visual materials and examples", description: "Show me what you mean" },
      { value: "detailed_explanations", text: "Detailed explanations and data", description: "Give me the full picture" },
      { value: "personal_stories", text: "Personal stories and examples", description: "Real experiences help me understand" },
    ],
  },
  {
    question: "At the end of the process, success means:",
    options: [
      { value: "achieved_goals", text: "You achieved your goals efficiently", description: "I got what I wanted quickly" },
      { value: "positive_experience", text: "Everyone had a positive experience", description: "The journey was as important as the destination" },
      { value: "right_choice", text: "You made the right choice", description: "This decision will serve me well" },
      { value: "stress_free", text: "The process was stress-free", description: "I felt supported throughout" },
    ],
  },
];

// ---------------------------------------------------------------------------
// CLIENT archetype definitions (approved source content), keyed by the
// orientation-style-stressResponse triple. Wording is exact.
// ---------------------------------------------------------------------------

export interface ClientArchetypeProfile {
  motivations: string[];
  communication: string[];
  stressReduction: string[];
}

export interface ClientArchetypeDefinition {
  name: string;
  summary: string;
  buyerProfile: ClientArchetypeProfile;
  sellerProfile: ClientArchetypeProfile;
}

const archetypeDefinitions: Record<string, ClientArchetypeDefinition> = {
  "Driver-Design-Focused-Freeze": {
    name: "The Visionary",
    summary:
      "A creative self-starter who values aesthetics but can become indecisive when overwhelmed. Needs visual aids, step-by-step support, and encouragement to process decisions at their own pace.",
    buyerProfile: {
      motivations: ["Seeks unique, standout properties with design flair", "Motivated by creative potential and aesthetic appeal", "Values being first to discover special properties"],
      communication: ["Use inspiring visuals and design-focused language", "Present clear, visual options (no more than 2-3 at a time)", "Provide step-by-step guidance with creative elements"],
      stressReduction: ["Under stress, may freeze when overwhelmed with choices", "Reduce stress by narrowing options and providing visual summaries", "Allow time for creative reflection and decision processing"],
    },
    sellerProfile: {
      motivations: ["Wants their home's unique design to be showcased", "Motivated by creative marketing and presentation", "Values aesthetic appeal in marketing materials"],
      communication: ["Use visually stunning marketing materials", "Present design-focused feedback and suggestions", "Provide creative staging and presentation ideas"],
      stressReduction: ["May become indecisive when overwhelmed with feedback", "Reduce stress by providing clear, visual summaries of progress", "Break decisions into manageable, creative steps"],
    },
  },
  "Driver-Design-Focused-Fight": {
    name: "The Trailblazer",
    summary:
      "A bold, design-loving initiator who thrives on action and quick decisions. Responds best to clear choices and direct communication, especially in moments of stress.",
    buyerProfile: {
      motivations: ["Seeks unique, standout properties with design flair", "Motivated by being first to act and securing great deals", "Prefers fast, decisive processes"],
      communication: ["Use direct, concise communication", "Present clear, actionable options (no more than 2-3 at a time)", "Highlight opportunities for quick wins"],
      stressReduction: ["Under stress, wants to 'fight' through obstacles, may push for fast answers", "Reduce stress by being responsive, assertive, and solution-focused", "Avoid delays and indecision"],
    },
    sellerProfile: {
      motivations: ["Wants to set the pace and outshine the competition", "Motivated by a fast, high-impact sale", "Prefers bold marketing and decisive negotiations"],
      communication: ["Be direct and proactive in sharing updates", "Present strong, clear recommendations for pricing and offers", "Reinforce their leadership in the process"],
      stressReduction: ["May become frustrated with slowdowns or indecision", "Reduce stress by providing fast solutions and taking initiative", "Frame challenges as opportunities to 'win'"],
    },
  },
  "Driver-Design-Focused-Flight": {
    name: "The Dreamchaser",
    summary:
      "A style-driven go-getter who may avoid tough decisions under stress. Benefits from proactive check-ins, visual inspiration, and gentle nudges to keep moving forward.",
    buyerProfile: {
      motivations: ["Seeks a home that inspires and excites", "Motivated by creative possibilities and unique features", "Prefers flexibility and options"],
      communication: ["Use inspiring visuals and creative language", "Offer options but avoid overwhelming with too many choices", "Check in regularly with encouragement"],
      stressReduction: ["Under stress, may avoid or delay decisions ('flight' response)", "Reduce stress by keeping communication positive and low-pressure", "Gently guide them back to decisions with reminders of their vision"],
    },
    sellerProfile: {
      motivations: ["Wants their home's unique style to shine", "Motivated by creative marketing and presentation", "Prefers flexibility in showings and negotiations"],
      communication: ["Use visuals and creative marketing strategies", "Keep updates light and positive", "Avoid high-pressure tactics"],
      stressReduction: ["May avoid or delay tough decisions", "Reduce stress by breaking tasks into manageable pieces", "Provide gentle reminders and reassurance"],
    },
  },
  "Driver-Design-Focused-Fawn": {
    name: "The Inspirer",
    summary:
      "A creative achiever who seeks harmony and affirmation. Appreciates positive feedback, collaborative brainstorming, and reassurance during stressful milestones.",
    buyerProfile: {
      motivations: ["Seeks a home that inspires and feels harmonious", "Motivated by shared vision and creative collaboration", "Prefers encouragement and affirmation"],
      communication: ["Use collaborative, positive language", "Offer praise for their ideas and choices", "Involve them in creative brainstorming"],
      stressReduction: ["Under stress, seeks reassurance and harmony", "Reduce stress by affirming their contributions and offering support", "Avoid criticism or negative feedback"],
    },
    sellerProfile: {
      motivations: ["Wants their home's story and design to be celebrated", "Motivated by positive collaboration in marketing and staging", "Prefers affirmation and group input"],
      communication: ["Use positive, affirming updates", "Involve them in creative marketing decisions", "Highlight their role in the process"],
      stressReduction: ["Seeks reassurance and harmony", "Reduce stress by celebrating their ideas and providing encouragement", "Avoid confrontational or critical conversations"],
    },
  },
  "Driver-Practical-Freeze": {
    name: "The Strategist",
    summary:
      "A results-oriented decision-maker who values efficiency but may freeze with too many options. Needs clear processes, timelines, and practical checklists to regain momentum.",
    buyerProfile: {
      motivations: ["Seeks the best value and a straightforward transaction", "Motivated by efficiency and smart choices", "Prefers clear, logical decision-making"],
      communication: ["Use structured, data-driven presentations", "Provide clear timelines and practical checklists", "Present limited, well-analyzed options"],
      stressReduction: ["May freeze when presented with too many options", "Reduce stress by providing clear processes and step-by-step guidance", "Use practical checklists to maintain momentum"],
    },
    sellerProfile: {
      motivations: ["Wants a strategic, well-planned sale", "Motivated by maximizing value through smart positioning", "Prefers data-driven approach"],
      communication: ["Present market data and strategic recommendations", "Provide clear timelines and action steps", "Use analytical approach to pricing and marketing"],
      stressReduction: ["May become overwhelmed by too many decisions at once", "Reduce stress by breaking strategy into clear phases", "Provide written summaries and action plans"],
    },
  },
  "Driver-Practical-Fight": {
    name: "The Closer",
    summary:
      "A pragmatic, action-oriented leader who tackles obstacles head-on. Thrives with concise updates, data-driven options, and direct calls to action.",
    buyerProfile: {
      motivations: ["Seeks the best value and a straightforward transaction", "Motivated by efficiency and results", "Prefers clear, actionable choices"],
      communication: ["Use concise, data-driven updates", "Present options with pros/cons and bottom-line impact", "Be direct and decisive"],
      stressReduction: ["Under stress, takes charge, may push for fast resolution", "Reduce stress by being responsive and solution-focused", "Avoid delays and indecision"],
    },
    sellerProfile: {
      motivations: ["Wants a fast, profitable sale", "Motivated by strong negotiation and clear outcomes", "Prefers data-backed marketing and offers"],
      communication: ["Be direct and data-focused", "Present strong recommendations and actionable next steps", "Reinforce their leadership in negotiations"],
      stressReduction: ["May become frustrated with slowdowns or ambiguity", "Reduce stress by providing fast solutions and clear direction", "Frame challenges as opportunities for decisive action"],
    },
  },
  "Driver-Practical-Flight": {
    name: "The Pathfinder",
    summary:
      "A practical initiator who prefers to avoid conflict or overwhelm. Benefits from streamlined choices, low-pressure environments, and reminders of next steps.",
    buyerProfile: {
      motivations: ["Seeks a functional, hassle-free home", "Motivated by efficiency and simplicity", "Prefers minimal pressure and clear next steps"],
      communication: ["Keep updates brief and focused", "Present only essential choices", "Use reminders for important deadlines"],
      stressReduction: ["Under stress, may avoid or delay decisions", "Reduce stress by simplifying the process and avoiding urgency", "Allow space for reflection"],
    },
    sellerProfile: {
      motivations: ["Wants a straightforward, low-hassle sale", "Motivated by efficiency and minimal disruption", "Prefers clear, simple plans"],
      communication: ["Be concise and direct", "Present only necessary information", "Avoid overloading with details"],
      stressReduction: ["May disengage if overwhelmed", "Reduce stress by keeping the process simple and low-pressure", "Provide clear timelines and reminders"],
    },
  },
  "Driver-Practical-Fawn": {
    name: "The Advocate",
    summary:
      "A goal-driven achiever who values practical outcomes and harmonious relationships. Responds well to supportive collaboration and affirmation, especially under stress.",
    buyerProfile: {
      motivations: ["Seeks a home that balances value and comfort for all involved", "Motivated by practical benefits and keeping everyone happy", "Prefers clear, step-by-step processes with room for input"],
      communication: ["Use supportive, encouraging language", "Provide practical information and invite feedback", "Affirm their decisions and collaborative spirit"],
      stressReduction: ["Under stress, seeks reassurance and group harmony", "Reduce stress by affirming their choices and involving them in solutions", "Avoid confrontation; focus on shared goals"],
    },
    sellerProfile: {
      motivations: ["Wants a smooth, positive sale that benefits everyone involved", "Motivated by practical outcomes and happy relationships", "Prefers to be kept in the loop and have their input valued"],
      communication: ["Use inclusive, supportive updates", "Provide practical, actionable steps", "Affirm their contributions and keep communication open"],
      stressReduction: ["Seeks reassurance and consensus", "Reduce stress by validating their input and celebrating progress", "Avoid pressure and negative feedback"],
    },
  },
  "Collaborator-Design-Focused-Freeze": {
    name: "The Curator",
    summary:
      "A team-oriented, design-loving client who can feel paralyzed by too many choices. Needs collaborative decision-making, visual summaries, and gentle pacing.",
    buyerProfile: {
      motivations: ["Seeks a home that delights all decision-makers and reflects shared style", "Motivated by creative collaboration and consensus", "Prefers group input and visual options"],
      communication: ["Use group discussions and shared mood boards", "Summarize options visually and limit choices", "Move at a gentle, inclusive pace"],
      stressReduction: ["May freeze if presented with too many options or pressured to decide", "Reduce stress by narrowing choices and providing clear, visual summaries", "Allow time for group reflection"],
    },
    sellerProfile: {
      motivations: ["Wants everyone involved to feel good about the sale", "Motivated by showcasing the home's design story", "Prefers shared decision-making for staging and offers"],
      communication: ["Involve all stakeholders in discussions", "Use visual summaries for marketing and offers", "Avoid rushing; allow for consensus-building"],
      stressReduction: ["May stall if overwhelmed by feedback or decisions", "Reduce stress by breaking steps into phases and recapping in writing", "Offer reassurance and time for group input"],
    },
  },
  "Collaborator-Design-Focused-Fight": {
    name: "The Spark",
    summary:
      "A creative connector who brings energy to group decisions but can become assertive under stress. Benefits from structured brainstorming and clear roles in the process.",
    buyerProfile: {
      motivations: ["Seeks a home that excites and energizes everyone involved", "Motivated by creative possibilities and team wins", "Prefers active, collaborative decision-making"],
      communication: ["Use lively, engaging discussions", "Assign clear roles in group tasks", "Encourage brainstorming and creative input"],
      stressReduction: ["Under stress, may become assertive or push for quick decisions", "Reduce stress by providing structure and clear responsibilities", "Channel energy into creative problem-solving"],
    },
    sellerProfile: {
      motivations: ["Wants to energize the sale and showcase the home's creative features", "Motivated by team collaboration and bold marketing", "Prefers to lead or contribute to group efforts"],
      communication: ["Use structured brainstorming sessions", "Assign clear roles for staging, marketing, and negotiations", "Keep communication lively and focused"],
      stressReduction: ["May become pushy or impatient under stress", "Reduce stress by setting clear expectations and dividing tasks", "Encourage creative solutions and celebrate quick wins"],
    },
  },
  "Collaborator-Design-Focused-Flight": {
    name: "The Explorer",
    summary:
      "A visually inspired collaborator who may withdraw when stressed. Needs supportive check-ins, mood boards, and a focus on shared vision to stay engaged.",
    buyerProfile: {
      motivations: ["Seeks a home that sparks imagination and suits everyone's tastes", "Motivated by creative potential and group harmony", "Prefers visual inspiration and group input"],
      communication: ["Use mood boards and collaborative visuals", "Encourage team discussions and shared vision", "Offer gentle reminders and encouragement"],
      stressReduction: ["May withdraw or avoid decisions under stress", "Reduce stress by keeping communication positive and low-pressure", "Re-engage with visual inspiration and group support"],
    },
    sellerProfile: {
      motivations: ["Wants to showcase the home's creative story", "Motivated by a collaborative, low-pressure process", "Prefers visual marketing and group involvement"],
      communication: ["Share marketing visuals and progress updates", "Involve all stakeholders in decisions", "Keep communication supportive and low-pressure"],
      stressReduction: ["May disengage if overwhelmed", "Reduce stress by simplifying steps and keeping the process collaborative", "Use visuals to keep focus and motivation"],
    },
  },
  "Collaborator-Design-Focused-Fawn": {
    name: "The Harmonizer",
    summary:
      "A style-focused team player who seeks consensus and reassurance. Thrives with inclusive discussions, positive reinforcement, and a calming environment.",
    buyerProfile: {
      motivations: ["Seeks a beautiful home that pleases all decision-makers", "Motivated by harmony and shared happiness", "Prefers group input and affirmation"],
      communication: ["Use inclusive, positive language", "Encourage input from all stakeholders", "Offer regular reassurance and affirmation"],
      stressReduction: ["Seeks reassurance and consensus under stress", "Reduce stress by validating their input and allowing time for group reflection", "Avoid rushing decisions"],
    },
    sellerProfile: {
      motivations: ["Wants a smooth, positive sale that honors group input", "Motivated by harmony and shared success", "Prefers group involvement in staging and marketing"],
      communication: ["Use group updates and inclusive language", "Offer affirmation and celebrate contributions", "Avoid criticism or negative feedback"],
      stressReduction: ["Seeks reassurance and harmony", "Reduce stress by celebrating group input and avoiding conflict", "Allow extra time for consensus-building"],
    },
  },
  "Collaborator-Practical-Freeze": {
    name: "The Organizer",
    summary:
      "A practical, group-oriented client who may stall when overwhelmed. Needs clear agendas, shared checklists, and patient facilitation through each milestone.",
    buyerProfile: {
      motivations: ["Seeks a functional home that meets everyone's needs", "Motivated by efficiency and group satisfaction", "Prefers structured, collaborative processes"],
      communication: ["Use agendas and checklists for meetings", "Share progress updates and next steps", "Facilitate group input and decision-making"],
      stressReduction: ["May freeze if overloaded with information or decisions", "Reduce stress by breaking tasks into steps and recapping in writing", "Allow time for group discussion"],
    },
    sellerProfile: {
      motivations: ["Wants a straightforward, group-approved sale", "Motivated by efficiency and minimal disruption", "Prefers structured processes and group input"],
      communication: ["Share agendas and checklists for each stage", "Recap meetings and decisions in writing", "Encourage group discussion and consensus"],
      stressReduction: ["May stall if overwhelmed", "Reduce stress by structuring steps and offering written recaps", "Allow time for group feedback"],
    },
  },
  "Collaborator-Practical-Fight": {
    name: "The Producer",
    summary:
      "A hands-on, pragmatic collaborator who becomes assertive under stress. Responds best to action plans, delegated tasks, and transparent communication.",
    buyerProfile: {
      motivations: ["Seeks a home that meets group needs and practical goals", "Motivated by efficiency and results", "Prefers active involvement and clear roles"],
      communication: ["Use action plans and assign tasks", "Be transparent and direct", "Encourage group participation"],
      stressReduction: ["May become assertive or impatient under stress", "Reduce stress by delegating tasks and providing clear timelines", "Channel energy into productive action"],
    },
    sellerProfile: {
      motivations: ["Wants a fast, efficient sale with group involvement", "Motivated by results and clear outcomes", "Prefers active participation and clear assignments"],
      communication: ["Use transparent, direct updates", "Assign roles for staging, marketing, and negotiations", "Encourage group action"],
      stressReduction: ["May become pushy or impatient", "Reduce stress by setting clear expectations and dividing tasks", "Celebrate quick wins and group efforts"],
    },
  },
  "Collaborator-Practical-Flight": {
    name: "The Navigator",
    summary:
      "A practical team player who may disengage when overloaded. Benefits from group support, simplified options, and regular encouragement to stay on track.",
    buyerProfile: {
      motivations: ["Seeks a practical, group-approved home", "Motivated by efficiency and harmony", "Prefers group involvement and simple processes"],
      communication: ["Use group check-ins and simplified updates", "Offer encouragement and support", "Avoid overwhelming with details"],
      stressReduction: ["May disengage or avoid decisions under stress", "Reduce stress by simplifying choices and offering group support", "Encourage participation with positive reinforcement"],
    },
    sellerProfile: {
      motivations: ["Wants a straightforward, group-approved sale", "Motivated by efficiency and minimal disruption", "Prefers group involvement and simple steps"],
      communication: ["Use group updates and simplified information", "Encourage participation and offer support", "Avoid overloading with tasks"],
      stressReduction: ["May disengage if overwhelmed", "Reduce stress by keeping steps simple and providing group encouragement", "Allow time for group input"],
    },
  },
  "Collaborator-Practical-Fawn": {
    name: "The Supporter",
    summary:
      "A harmony-seeking, practical collaborator who values consensus and gentle guidance. Needs inclusive planning, affirmation, and a steady, reassuring process.",
    buyerProfile: {
      motivations: ["Seeks a home that meets group needs and brings harmony", "Motivated by consensus and group happiness", "Prefers inclusive decision-making and affirmation"],
      communication: ["Use inclusive, gentle communication", "Offer affirmation and celebrate group input", "Move at a steady, reassuring pace"],
      stressReduction: ["Seeks reassurance and consensus under stress", "Reduce stress by affirming contributions and allowing time for group discussion", "Avoid pressure and negative feedback"],
    },
    sellerProfile: {
      motivations: ["Wants a smooth, group-approved sale", "Motivated by consensus and minimal conflict", "Prefers inclusive planning and affirmation"],
      communication: ["Use inclusive, gentle updates", "Celebrate group input and provide affirmation", "Move at a steady pace"],
      stressReduction: ["Seeks reassurance and harmony", "Reduce stress by affirming contributions and allowing time for group input", "Avoid pressure and conflict"],
    },
  },
};

/** CLIENT archetype details keyed by approved archetype display name. */
export const CLIENT_ARCHETYPE_DETAILS: Record<string, ClientArchetypeDefinition> =
  Object.fromEntries(Object.values(archetypeDefinitions).map((d) => [d.name, d]));

// ---------------------------------------------------------------------------
// CLIENT archetype guidelines (approved source content), keyed by approved name.
// Buyer / seller / simultaneous approaches + avoid, and communication.
// ---------------------------------------------------------------------------

export const CLIENT_GUIDELINES: Record<string, ArchetypeGuidelines> = {
  "The Trailblazer": {
    buyer: {
      approaches: [
        "Showcase avant-garde listings with high-impact visuals and VR previews",
        "Emphasize novelty and cutting-edge design features",
        "Offer rapid alerts on market shifts to satisfy anticipatory urgency",
        "Create immersive virtual tours highlighting architectural breakthroughs",
      ],
      avoid:
        "Overloading with comparative data that induces analysis paralysis or highlighting risks in detail, which triggers loss-aversion",
    },
    seller: {
      approaches: [
        "Launch bold marketing narratives emphasizing innovation",
        "Provide instant performance metrics (views, bids) to leverage social proof",
        "Use scarcity framing in limited-time exclusive viewings",
        "Target high-end buyers seeking distinctive lifestyle properties",
      ],
      avoid:
        "Long approval processes that foster psychological reactance or negative framing of past performance, which promotes pessimism bias",
    },
    simultaneous: {
      approaches: [
        "Synchronize deals with tight, clear timelines to harness momentum",
        "Highlight potential gains using gain-framing strategies",
        "Leverage technology for seamless coordination",
        "Structure transactions to maximize strategic advantage",
      ],
      avoid:
        "Introducing too many options, causing decision fatigue or emphasizing hypothetical downsides, triggering risk aversion",
    },
    communication: {
      recommended: [
        "Short, vivid updates via voice or video to maintain engagement",
        "Real-time dashboards with progress cues for immediate feedback",
        "Bold, inspiring language that emphasizes vision and potential",
        "High-impact visual content with dramatic property presentations",
      ],
      avoid: [
        "Lengthy emails that exceed working-memory capacity",
        "Frequent check-ins that interrupt flow and reduce autonomy",
        "Conservative advice that limits innovative opportunities",
        "Traditional, paper-based processes",
      ],
    },
  },
  "The Strategist": {
    buyer: {
      approaches: [
        "Conduct multi-scenario simulations with sensitivity analysis",
        "Provide longitudinal trend graphs to clarify trajectories",
        "Develop multi-phase acquisition strategies with contingency planning",
        "Analyze demographic trends and future development potential",
      ],
      avoid:
        "Oversimplifying trade-offs, which increases regret likelihood or rushing to decisions, harms accuracy and fosters regret",
    },
    seller: {
      approaches: [
        "Formulate long-term sales blueprints with contingency buffers",
        "Use decision matrices to weigh competitive advantages",
        "Implement phased marketing approach with performance optimization",
        "Create strategic positioning that maximizes competitive advantages",
      ],
      avoid:
        "Ad hoc adjustments, breaks the illusion of control or incomplete briefs that erode confidence in planning",
    },
    simultaneous: {
      approaches: [
        "Align purchase and sale timelines via backcasting techniques",
        "Frame updates in strategic milestones to sustain engagement",
        "Develop systematic contingency plans for complex scenarios",
        "Provide comprehensive analytical frameworks to reduce uncertainty",
      ],
      avoid:
        "Mixing too many variables at once, causes cognitive overload or vagueness in objectives, leads to decision inertia",
    },
    communication: {
      recommended: [
        "Detailed policy memos with linked appendices",
        "Pre-meeting briefs with explicit objectives",
        "Analytical presentations with strategic frameworks and models",
        "Comprehensive documentation with detailed supporting research",
      ],
      avoid: [
        "Impromptu updates disrupting mental models",
        "Overly emotive language diluting analytical focus",
        "Vague or incomplete information",
        "Decisions made without collaborative analysis",
      ],
    },
  },
  "The Supporter": {
    buyer: {
      approaches: [
        "Provide step-by-step guides and resource packets",
        "Connect clients to community programs and peer testimonials",
        "Advocate for properties that support diverse family structures",
        "Emphasize accessibility features and inclusive neighborhood amenities",
      ],
      avoid:
        "Patronizing tones, trigger learned helplessness or skipping steps, creates uncertainty and perceived abandonment",
    },
    seller: {
      approaches: [
        "Offer workshops on homeownership basics and financing options",
        "Highlight inclusive neighborhood features (parks, schools, services)",
        "Advocate for fair pricing that serves diverse economic backgrounds",
        "Support sellers in creating opportunities for first-time buyers",
      ],
      avoid:
        "Elite jargon, excludes or intimidates potential buyers or one-size-fits-all proposals, ignore unique needs",
    },
    simultaneous: {
      approaches: [
        "Align timelines with family schedules and support network availability",
        "Use empathy-driven checklists to ensure no one is left behind",
        "Provide comprehensive support and resource referrals",
        "Connect clients with community support networks and resources",
      ],
      avoid:
        "Assuming prior knowledge, leads to confusion and stress or focusing solely on transactions, neglects human element",
    },
    communication: {
      recommended: [
        "Regular check-ins with open invitations for questions",
        "Provide cheat-sheets, glossaries, and visual FAQs",
        "Educational presentations about housing rights and opportunities",
        "Patient explanation of complex processes and available resources",
      ],
      avoid: [
        "Rapid bulletins without context, create anxiety",
        "Dismissing emotional concerns as irrelevant",
        "Using technical jargon without clear explanations",
        "Making assumptions about knowledge or experience level",
      ],
    },
  },
  "The Spark": {
    buyer: {
      approaches: [
        "Provide concept boards and AR overlays for imaginative exploration",
        "Share case studies of creative renovations to spark ideas",
        "Schedule private viewing sessions for uninterrupted creative contemplation",
        "Encourage vision boarding and personal space customization planning",
      ],
      avoid:
        "Rigid property specifications that limit creative potential or traditional, uninspiring home tours, stifles imagination",
    },
    seller: {
      approaches: [
        "Create lifestyle marketing that tells creative stories",
        "Position property as a canvas for buyer's self-expression",
        "Develop artistic presentations highlighting architectural potential",
        "Target creative buyers through inspiring visual campaigns",
      ],
      avoid:
        "Generic listing descriptions lacking personality or rushed marketing, misses creative buyer connection",
    },
    simultaneous: {
      approaches: [
        "Preserve autonomy while offering creative coordination support",
        "Allow flexibility in timelines to accommodate inspiration cycles",
        "Provide design consultation connections for transition planning",
        "Structure deals to maximize creative potential in both properties",
      ],
      avoid:
        "Rigid processes that constrain creative expression or micromanagement, reduces autonomy satisfaction",
    },
    communication: {
      recommended: [
        "Visual communication with mood boards and inspiring examples",
        "Open-ended conversations that encourage idea sharing",
        "Flexible scheduling that respects creative rhythms",
        "Supportive brainstorming sessions with professional input",
      ],
      avoid: [
        "Overly structured meetings that feel restrictive",
        "Dismissing creative ideas as impractical",
        "Pressure to make quick decisions without reflection time",
        "Technical language that disconnects from emotional vision",
      ],
    },
  },
  "The Closer": {
    buyer: {
      approaches: [
        "Present structured ROI models with clear, numeric benchmarks",
        "Utilize commitment bias techniques through decisive action steps",
        "Offer streamlined decision frameworks that eliminate complexity",
        "Provide competitive market intelligence for strategic advantage",
      ],
      avoid:
        "Indecisive responses that undermine leadership confidence or analysis paralysis, frustrates action orientation",
    },
    seller: {
      approaches: [
        "Deploy aggressive pricing strategies with market dominance positioning",
        "Use scarcity framing and urgency tactics to accelerate decisions",
        "Leverage competitive bidding situations for maximum leverage",
        "Execute decisive marketing campaigns with immediate impact focus",
      ],
      avoid:
        "Passive marketing approaches that lack urgency or hesitant negotiation, reduces competitive positioning",
    },
    simultaneous: {
      approaches: [
        "Coordinate timing to maximize negotiating power in both deals",
        "Use tactical leverage points to accelerate both transactions",
        "Structure contingencies to maintain control and flexibility",
        "Deploy systematic closing strategies with predetermined solutions",
      ],
      avoid:
        "Passive coordination that reduces leverage opportunities or uncertainty that undermines confident decision-making",
    },
    communication: {
      recommended: [
        "Direct, results-focused briefings with clear action items",
        "Immediate responses that maintain momentum and confidence",
        "Strategic updates highlighting competitive advantages",
        "Decisive recommendations with strong supporting rationale",
      ],
      avoid: [
        "Tentative language that suggests uncertainty",
        "Delayed responses that slow momentum",
        "Overly detailed analysis that delays action",
        "Emotional appeals that conflict with business focus",
      ],
    },
  },
  "The Curator": {
    buyer: {
      approaches: [
        "Present curated property collections with detailed aesthetic analysis",
        "Provide collaborative mood boards and design consultation sessions",
        "Schedule group viewing sessions with design professionals",
        "Offer systematic comparison tools with visual design elements",
      ],
      avoid:
        "Overwhelming with too many options simultaneously or rushing aesthetic decisions, causes analysis paralysis",
    },
    seller: {
      approaches: [
        "Create sophisticated marketing campaigns with professional staging",
        "Develop collaborative pricing strategies with market positioning input",
        "Use design-focused photography and virtual staging for optimal presentation",
        "Coordinate group consultations for strategic decision-making",
      ],
      avoid:
        "Making unilateral decisions without group input or neglecting aesthetic presentation, reduces market appeal",
    },
    simultaneous: {
      approaches: [
        "Coordinate design elements across both properties for cohesive transition",
        "Provide collaborative timeline management with aesthetic considerations",
        "Offer design consultation for optimal property preparation",
        "Structure deals to preserve design integrity and group harmony",
      ],
      avoid:
        "Rushing aesthetic decisions under time pressure or conflicting design directions, creates stress and confusion",
    },
    communication: {
      recommended: [
        "Visual presentations with collaborative design planning sessions",
        "Regular check-ins with mood boards and aesthetic progress updates",
        "Group discussions that honor individual design preferences",
        "Structured feedback sessions with visual design examples",
      ],
      avoid: [
        "Individual decision-making that bypasses group aesthetic input",
        "Technical discussions without visual design context",
        "Pressure to make quick aesthetic decisions",
        "Dismissing design concerns as superficial",
      ],
    },
  },
  "The Explorer": {
    buyer: {
      approaches: [
        "Provide flexible viewing schedules with inspirational property tours",
        "Create visual journey maps showing neighborhood exploration opportunities",
        "Offer collaborative vision boarding sessions for shared dreams",
        "Schedule stress-free exploration time without pressure",
      ],
      avoid:
        "High-pressure decision deadlines or overwhelming with technical details, triggers withdrawal response",
    },
    seller: {
      approaches: [
        "Develop inspiring marketing that tells the property's story",
        "Create collaborative marketing strategies with group input",
        "Use lifestyle photography that emphasizes exploration and discovery",
        "Provide gentle guidance with supportive market positioning",
      ],
      avoid:
        "Aggressive marketing tactics or rushed listing decisions, conflicts with exploration mindset",
    },
    simultaneous: {
      approaches: [
        "Allow flexible timelines that accommodate exploration needs",
        "Provide supportive coordination without overwhelming pressure",
        "Create visual transition planning with collaborative input",
        "Structure deals to minimize stress and preserve group harmony",
      ],
      avoid:
        "Rigid timelines that prevent adequate exploration or pressure that triggers avoidance behavior",
    },
    communication: {
      recommended: [
        "Gentle check-ins with visual updates and inspirational content",
        "Collaborative planning sessions with mood boards and vision sharing",
        "Supportive language that encourages continued engagement",
        "Flexible communication that respects individual processing styles",
      ],
      avoid: [
        "Frequent pressure calls that feel overwhelming",
        "Technical language that disconnects from emotional journey",
        "Ultimatums or pressure tactics that trigger withdrawal",
        "Individual focus that ignores group exploration dynamics",
      ],
    },
  },
  "The Pathfinder": {
    buyer: {
      approaches: [
        "Provide comprehensive market research with escape route analysis",
        "Offer flexible viewing schedules with low-pressure exploration",
        "Create detailed neighborhood guides with lifestyle considerations",
        "Present multiple backup options to reduce decision anxiety",
      ],
      avoid: "High-pressure decision deadlines or limited options, triggers flight response",
    },
    seller: {
      approaches: [
        "Develop strategic marketing with multiple positioning options",
        "Provide comprehensive market analysis with realistic timelines",
        "Use data-driven pricing strategies with flexible adjustment options",
        "Create marketing campaigns that attract serious, qualified buyers",
      ],
      avoid:
        "Rushing market entry or aggressive pricing without flexibility, increases stress and uncertainty",
    },
    simultaneous: {
      approaches: [
        "Coordinate timing with built-in flexibility and contingency plans",
        "Provide systematic backup strategies for various scenarios",
        "Structure deals with multiple exit strategies and safety nets",
        "Offer comprehensive project management with stress reduction focus",
      ],
      avoid: "Rigid timelines without flexibility or high-risk strategies, triggers avoidance behavior",
    },
    communication: {
      recommended: [
        "Regular updates with comprehensive information and options",
        "Structured planning sessions with detailed backup strategies",
        "Data-driven communications that reduce uncertainty",
        "Reassuring language that emphasizes safety and flexibility",
      ],
      avoid: [
        "Surprise changes that increase uncertainty",
        "Pressure tactics that trigger avoidance responses",
        "Limited information that increases anxiety",
        "Rigid communication that doesn't allow for adjustments",
      ],
    },
  },
  "The Navigator": {
    buyer: {
      approaches: [
        "Provide step-by-step guides with gentle pacing and support",
        "Create collaborative decision-making processes with group input",
        "Offer comprehensive resources with emotional support throughout",
        "Schedule regular check-ins with encouragement and reassurance",
      ],
      avoid:
        "Overwhelming with too much information or rushing collaborative decisions, creates stress and withdrawal",
    },
    seller: {
      approaches: [
        "Develop supportive marketing strategies with gentle positioning",
        "Provide collaborative guidance through market preparation process",
        "Use inclusive language that honors all stakeholders' concerns",
        "Create marketing that emphasizes community and support",
      ],
      avoid:
        "Aggressive marketing tactics or individual decision-making, conflicts with collaborative support needs",
    },
    simultaneous: {
      approaches: [
        "Coordinate both transactions with gentle, supportive guidance",
        "Provide comprehensive support systems throughout the process",
        "Structure deals to minimize stress with collaborative decision-making",
        "Offer emotional support and reassurance during challenging moments",
      ],
      avoid:
        "High-pressure coordination or individual responsibility, triggers overwhelm and support-seeking",
    },
    communication: {
      recommended: [
        "Gentle, supportive communications with collaborative planning",
        "Regular encouragement with step-by-step guidance",
        "Group communications that include all stakeholders",
        "Reassuring language that emphasizes support and partnership",
      ],
      avoid: [
        "Individual pressure that bypasses support systems",
        "Technical language without emotional support context",
        "Rushed communications that feel overwhelming",
        "Dismissing concerns or need for reassurance",
      ],
    },
  },
  "The Advocate": {
    buyer: {
      approaches: [
        "Facilitate empathy-driven walkthroughs highlighting community and lifestyle",
        "Provide collaborative decision-making sessions with all stakeholders",
        "Offer comprehensive neighborhood research with social connection focus",
        "Create inclusive exploration experiences that honor all perspectives",
      ],
      avoid:
        "Individual decision-making that excludes stakeholders or high-pressure tactics, conflicts with collaborative values",
    },
    seller: {
      approaches: [
        "Develop marketing that emphasizes community and lifestyle benefits",
        "Create collaborative pricing strategies with stakeholder input",
        "Use inclusive language that appeals to diverse buyer perspectives",
        "Provide comprehensive support throughout the selling process",
      ],
      avoid:
        "Aggressive or exclusive marketing approaches or individual decision-making, undermines collaborative principles",
    },
    simultaneous: {
      approaches: [
        "Coordinate both transactions with inclusive stakeholder involvement",
        "Provide collaborative support that honors all perspectives",
        "Structure deals to benefit entire community of stakeholders",
        "Offer comprehensive guidance that preserves relationships",
      ],
      avoid:
        "Competitive approaches that create winners/losers or individual focus, conflicts with advocacy values",
    },
    communication: {
      recommended: [
        "Inclusive communications that involve all relevant stakeholders",
        "Empathetic language that acknowledges diverse perspectives",
        "Collaborative planning sessions with consensus-building focus",
        "Regular check-ins that ensure all voices are heard",
      ],
      avoid: [
        "Individual communications that bypass stakeholder groups",
        "Competitive language that creates division",
        "Rushed decisions that don't allow for input",
        "Technical focus that ignores relationship dynamics",
      ],
    },
  },
  "The Visionary": {
    buyer: {
      approaches: [
        "Provide comprehensive market research with escape route analysis",
        "Create detailed aesthetic portfolios with design-focused exploration",
        "Schedule flexible viewing sessions with low-pressure environments",
        "Offer visual inspiration boards to spark creative decision-making",
      ],
      avoid:
        "High-pressure decision deadlines or overwhelming with too many technical details, triggers analysis paralysis",
    },
    seller: {
      approaches: [
        "Develop sophisticated marketing with professional aesthetic presentation",
        "Create design-focused listing strategies that highlight unique features",
        "Use artistic photography and visual storytelling for market appeal",
        "Provide comprehensive market analysis with realistic timelines",
      ],
      avoid:
        "Rushing aesthetic decisions or aggressive marketing tactics, conflicts with thoughtful creative process",
    },
    simultaneous: {
      approaches: [
        "Coordinate timing with built-in flexibility for creative decision-making",
        "Provide aesthetic consultation for optimal property preparation",
        "Structure deals to preserve design integrity and creative vision",
        "Offer comprehensive support with stress reduction focus",
      ],
      avoid:
        "Rigid timelines that prevent aesthetic consideration or pressure that triggers indecision",
    },
    communication: {
      recommended: [
        "Visual presentations with comprehensive design planning sessions",
        "Regular check-ins with aesthetic progress updates and inspiration",
        "Structured planning sessions with detailed backup strategies",
        "Reassuring language that emphasizes creative potential and flexibility",
      ],
      avoid: [
        "Surprise changes that increase uncertainty",
        "Pressure tactics that trigger avoidance responses",
        "Technical focus without aesthetic context",
        "Rushing creative decisions without reflection time",
      ],
    },
  },
  "The Dreamchaser": {
    buyer: {
      approaches: [
        "Provide flexible viewing schedules with inspirational property exploration",
        "Create visual journey maps emphasizing lifestyle and design potential",
        "Offer stress-free exploration time with gentle guidance",
        "Schedule private viewing sessions for uninterrupted creative contemplation",
      ],
      avoid: "High-pressure deadlines or overwhelming technical details, triggers flight response",
    },
    seller: {
      approaches: [
        "Develop inspiring marketing that tells the property's creative story",
        "Use lifestyle photography emphasizing design and exploration opportunities",
        "Provide gentle guidance with supportive market positioning",
        "Create marketing campaigns that attract design-conscious buyers",
      ],
      avoid: "Aggressive marketing tactics or rushed decisions, conflicts with exploration mindset",
    },
    simultaneous: {
      approaches: [
        "Allow flexible timelines that accommodate creative exploration needs",
        "Provide supportive coordination without overwhelming pressure",
        "Structure deals to minimize stress while preserving creative vision",
        "Create visual transition planning with design considerations",
      ],
      avoid: "Rigid timelines that prevent exploration or pressure that triggers avoidance behavior",
    },
    communication: {
      recommended: [
        "Gentle check-ins with visual updates and inspirational content",
        "Creative planning sessions with mood boards and vision sharing",
        "Supportive language that encourages continued engagement",
        "Flexible communication respecting individual creative processing",
      ],
      avoid: [
        "Frequent pressure calls that feel overwhelming",
        "Technical language disconnected from creative vision",
        "Ultimatums or pressure tactics that trigger withdrawal",
        "Individual focus that ignores design exploration dynamics",
      ],
    },
  },
  "The Inspirer": {
    buyer: {
      approaches: [
        "Provide collaborative design exploration with positive reinforcement",
        "Create inclusive decision-making processes with creative brainstorming",
        "Offer comprehensive support with encouragement throughout",
        "Schedule regular check-ins with affirmation and design inspiration",
      ],
      avoid:
        "Individual pressure that bypasses creative collaboration or criticism that undermines confidence",
    },
    seller: {
      approaches: [
        "Develop supportive marketing strategies with positive positioning",
        "Provide collaborative guidance through creative market preparation",
        "Use inclusive language that honors design vision and stakeholder input",
        "Create marketing emphasizing community and creative lifestyle",
      ],
      avoid:
        "Aggressive tactics or individual decision-making, conflicts with collaborative creative values",
    },
    simultaneous: {
      approaches: [
        "Coordinate transactions with gentle, supportive creative guidance",
        "Provide comprehensive design support throughout both processes",
        "Structure deals to minimize stress with collaborative creative decision-making",
        "Offer emotional support and design affirmation during challenging moments",
      ],
      avoid:
        "High-pressure coordination or individual creative responsibility, triggers overwhelm",
    },
    communication: {
      recommended: [
        "Gentle, supportive communications with collaborative creative planning",
        "Regular encouragement with design-focused guidance",
        "Group communications including all creative stakeholders",
        "Reassuring language emphasizing creative support and partnership",
      ],
      avoid: [
        "Individual pressure bypassing creative support systems",
        "Technical language without design inspiration context",
        "Rushed communications that feel overwhelming",
        "Dismissing creative concerns or need for design affirmation",
      ],
    },
  },
  "The Organizer": {
    buyer: {
      approaches: [
        "Supply comprehensive project management with collaborative planning tools",
        "Provide detailed checklists and systematic comparison matrices",
        "Coordinate multiple consultations with organized scheduling systems",
        "Offer structured guidance with clear roles and responsibilities",
      ],
      avoid: "Last-minute changes that disrupt planning or overwhelming with unorganized information",
    },
    seller: {
      approaches: [
        "Develop systematic marketing strategies with organized campaign management",
        "Provide collaborative planning through structured market preparation",
        "Use organized presentation materials with clear timelines",
        "Create marketing emphasizing systematic approach and reliability",
      ],
      avoid:
        "Disorganized approaches or individual decision-making, conflicts with collaborative planning needs",
    },
    simultaneous: {
      approaches: [
        "Integrate systematic coordination with collaborative project management",
        "Provide organized support systems throughout both processes",
        "Structure deals with clear planning and collaborative oversight",
        "Offer comprehensive organization support during complex coordination",
      ],
      avoid: "Chaotic coordination or individual planning responsibility, triggers overwhelm",
    },
    communication: {
      recommended: [
        "Organized communications with systematic collaborative planning",
        "Regular structured updates with clear project management guidance",
        "Group planning sessions with comprehensive organization tools",
        "Clear language emphasizing systematic support and collaboration",
      ],
      avoid: [
        "Disorganized communications that bypass planning systems",
        "Individual focus without collaborative organization context",
        "Rushed planning that doesn't allow for systematic input",
        "Dismissing organization concerns or collaborative planning needs",
      ],
    },
  },
  "The Harmonizer": {
    buyer: {
      approaches: [
        "Use biophilic design elements and natural lighting in property showcases",
        "Provide sensory experiences during showings (scents, textures, sounds)",
        "Create harmony-focused virtual staging with feng shui principles",
        "Offer meditation spaces and wellness-oriented property features",
      ],
      avoid: "High-pressure tactics or competitive bidding scenarios, creates anxiety and conflict",
    },
    seller: {
      approaches: [
        "Market the home's peaceful qualities and harmony-inducing features",
        "Use collaborative staging approaches with family input",
        "Emphasize community connections and neighborhood harmony",
        "Create inclusive marketing that appeals to diverse buyers",
      ],
      avoid:
        "Aggressive pricing strategies or confrontational negotiations, disrupts emotional balance",
    },
    simultaneous: {
      approaches: [
        "Coordinate smooth transitions with emphasis on emotional well-being",
        "Provide harmony-focused timeline management with buffer periods",
        "Use collaborative decision-making processes for complex situations",
        "Offer emotional support and stress-reduction techniques",
      ],
      avoid: "Rushed processes or conflict-heavy negotiations, overwhelms harmony-seeking nature",
    },
    communication: {
      recommended: [
        "Gentle, supportive communication with emphasis on collaboration",
        "Regular check-ins focused on emotional comfort and peace of mind",
        "Inclusive language that considers all family members' feelings",
        "Calming presence during stressful moments with reassurance",
      ],
      avoid: [
        "Harsh or confrontational communication styles",
        "Pressure tactics that create internal conflict",
        "Exclusion of family members from important discussions",
        "Creating competitive or stressful environments",
      ],
    },
  },
  "The Producer": {
    buyer: {
      approaches: [
        "Present ROI models and investment potential analysis",
        "Use commitment bias techniques with deposit structures",
        "Provide competitive market analysis with urgency indicators",
        "Offer exclusive access to high-performing properties",
      ],
      avoid:
        "Lengthy deliberation periods, triggers impatience or indecisive processes, undermines action orientation",
    },
    seller: {
      approaches: [
        "Implement aggressive marketing with performance metrics",
        "Use results-driven pricing strategies with market positioning",
        "Provide frequent updates on showing activity and feedback",
        "Create competitive environments to drive multiple offers",
      ],
      avoid:
        "Passive marketing approaches or unclear performance metrics, reduces confidence in results",
    },
    simultaneous: {
      approaches: [
        "Coordinate deals with aggressive timelines and clear milestones",
        "Use performance-based coordination with regular progress updates",
        "Implement backup strategies for maximum deal security",
        "Provide competitive advantage through strategic timing",
      ],
      avoid: "Unclear coordination or delayed responses, frustrates results-oriented expectations",
    },
    communication: {
      recommended: [
        "Direct, results-focused communication with clear action items",
        "Regular performance updates with metrics and achievements",
        "Confident, authoritative guidance with proven track record",
        "Quick response times with decisive recommendations",
      ],
      avoid: [
        "Vague communications without clear outcomes",
        "Lengthy explanations that delay action",
        "Uncertain or hesitant guidance",
        "Slow response times that hinder momentum",
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// CLIENT scoring → assignArchetype
// ---------------------------------------------------------------------------

const ORIENTATION_VOTES: Record<string, ClientOrientation> = {
  decide_quickly: "Driver", lead_process: "Driver", direct_assertive: "Driver", take_charge: "Driver",
  trust_instincts: "Driver", in_control: "Driver", asap: "Driver", achieved_goals: "Driver",
  discuss_options: "Collaborator", collaborate_team: "Collaborator", collaborative_winwin: "Collaborator",
  work_together: "Collaborator", seek_advice: "Collaborator", team_support: "Collaborator",
  positive_experience: "Collaborator", someone_guide: "Collaborator", guided_expert: "Collaborator",
  trusted_guidance: "Collaborator", agent_handle: "Collaborator", need_reassurance: "Collaborator",
};

const STYLE_VOTES: Record<string, ClientStyle> = {
  design_aesthetics: "Design-Focused", visual_appeal: "Design-Focused", emotional_connection: "Design-Focused",
  space_layout: "Design-Focused", visual_materials: "Design-Focused",
  practical_features: "Practical", affordability: "Practical", location: "Practical",
  practical_aspects: "Practical", investment_value: "Practical", financial_aspects: "Practical",
  research_thoroughly: "Practical", well_informed: "Practical", detailed_explanations: "Practical",
  careful_strategic: "Practical",
};

const STRESS_VOTES: Record<string, StressResponse> = {
  clear_guidance: "Freeze", clear_plan: "Freeze", information_clarity: "Freeze", space_time: "Freeze", space_process: "Freeze",
  quick_solutions: "Fight",
  distraction_humor: "Flight", avoid_postpone: "Flight", no_rush: "Flight", flexible_timing: "Flight", step_back: "Flight",
  extra_reassurance: "Fawn", encouragement: "Fawn", relationship_conflicts: "Fawn",
};

function tallyWinner<T extends string>(
  answers: Record<string, string>,
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

/** Resolve the canonical triple key, tolerating legacy "Collaborator-Design-*" aliases. */
function canonicalTripleKey(orientation: string, style: string, stress: string): string {
  const key = `${orientation}-${style}-${stress}`;
  if (archetypeDefinitions[key]) return key;
  // Alias: Collaborator-Design-* → Collaborator-Design-Focused-*
  const alias = key.replace("Collaborator-Design-", "Collaborator-Design-Focused-");
  if (archetypeDefinitions[alias]) return alias;
  return key;
}

/**
 * Score the client survey answers into the orientation/style/stress dimensions
 * and resolve the approved client archetype. Always returns an approved name.
 */
export function assignArchetype(answers: Record<string, string>): ArchetypeResult {
  const orientation = tallyWinner(answers, ORIENTATION_VOTES, "Collaborator", ["Driver", "Collaborator"]);
  const style = tallyWinner(answers, STYLE_VOTES, "Practical", ["Design-Focused", "Practical"]);
  const stressResponse = tallyWinner(answers, STRESS_VOTES, "Freeze", ["Freeze", "Fight", "Flight", "Fawn"]);
  const def = archetypeDefinitions[canonicalTripleKey(orientation, style, stressResponse)];
  const archetype = def?.name ?? "The Supporter";
  return {
    archetype,
    motivations: def?.buyerProfile.motivations ?? [],
    orientation,
    style,
    stressResponse,
  };
}

/** Guidelines for an approved client archetype (normalized). Null if unknown. */
export function getArchetypeGuidelines(archetype: string): ArchetypeGuidelines | null {
  const name = normalizeArchetypeName(archetype);
  return (name && CLIENT_GUIDELINES[name]) || null;
}

// ---------------------------------------------------------------------------
// AGENT survey questions + scoring (approved source content)
// ---------------------------------------------------------------------------

export const agentSurveyQuestions: SurveyQuestion[] = [
  { question: "Your approach to client relationships is:", options: [
    { value: "A", text: "Leading with vision and decisive action" },
    { value: "B", text: "Facilitating collaborative decision-making" },
    { value: "C", text: "Prioritizing emotional connection" },
    { value: "D", text: "Focusing on practical outcomes" },
  ] },
  { question: "When presenting a property, you emphasize:", options: [
    { value: "A", text: "Design aesthetics and wow factor" },
    { value: "B", text: "Investment potential and ROI data" },
    { value: "C", text: "Storytelling about lifestyle" },
    { value: "D", text: "Functional features and cost analysis" },
  ] },
  { question: "Under negotiation pressure, you:", options: [
    { value: "A", text: "Seek step-by-step guidance" },
    { value: "B", text: "Push for immediate solutions" },
    { value: "C", text: "Withdraw to reassess" },
    { value: "D", text: "Prioritize harmony" },
  ] },
  { question: "Your clients describe you as:", options: [
    { value: "A", text: "A visionary who inspires action" },
    { value: "B", text: "A trusted advisor who listens" },
    { value: "C", text: "A creative problem-solver" },
    { value: "D", text: "A results-driven strategist" },
  ] },
  { question: "When a deal stalls, you first:", options: [
    { value: "A", text: "Analyze all options methodically" },
    { value: "B", text: "Challenge objections head-on" },
    { value: "C", text: "Suggest pausing to rethink" },
    { value: "D", text: "Offer concessions to rebuild rapport" },
  ] },
  { question: "Colleagues say your superpower is:", options: [
    { value: "A", text: "Breakthrough ideas" }, { value: "B", text: "Energizing others" }, { value: "C", text: "Commanding authority" }, { value: "D", text: "Upholding excellence" }, { value: "E", text: "Building trust" }, { value: "F", text: "Intriguing insights" }, { value: "G", text: "Risk mitigation" },
  ] },
  { question: "Clients hire you because you:", options: [
    { value: "A", text: "Turn complexity into opportunity" }, { value: "B", text: "Make transactions exciting" }, { value: "C", text: "Exude confidence in high-stakes deals" }, { value: "D", text: "Deliver flawless execution" }, { value: "E", text: "Build security" }, { value: "F", text: "Reveal unexpected insights" }, { value: "G", text: "Anticipate pitfalls" },
  ] },
  { question: "Your natural negotiation approach is:", options: [
    { value: "A", text: "Competitive: Win the best terms" }, { value: "B", text: "Collaborative: Find mutual wins" }, { value: "C", text: "Accommodating: Preserve relationships" }, { value: "D", text: "Avoiding: Delay for more data" }, { value: "E", text: "Compromising: Split differences" }, { value: "F", text: "Analytical: Leverage data" }, { value: "G", text: "Directive: Take charge" }, { value: "H", text: "Emotive: Appeal emotionally" },
  ] },
  { question: "During tough negotiations, you:", options: [
    { value: "A", text: "Hold firm on core demands" }, { value: "B", text: "Brainstorm creative solutions" }, { value: "C", text: "Yield to maintain trust" }, { value: "D", text: "Table the discussion" }, { value: "E", text: "Propose middle-ground offers" }, { value: "F", text: "Present data-driven arguments" }, { value: "G", text: "Control the conversation" }, { value: "H", text: "Share stories to build rapport" },
  ] },
  { question: "When overwhelmed, you:", options: [
    { value: "A", text: "Freeze until priorities are clear" }, { value: "B", text: "Ruthlessly prioritize tasks" }, { value: "C", text: "Delegate and step back" }, { value: "D", text: "Check on others' stress levels" },
  ] },
  { question: "Your marketing strength is:", options: [
    { value: "A", text: "Stunning visuals and storytelling" }, { value: "B", text: "ROI charts and analytics" }, { value: "C", text: "Innovative concepts" }, { value: "D", text: "Practical feature highlights" },
  ] },
  { question: "You justify pricing with:", options: [
    { value: "A", text: "Design uniqueness" }, { value: "B", text: "Comparable sales data" }, { value: "C", text: "Emotional appeal" }, { value: "D", text: "Investment potential" },
  ] },
  { question: "Your open houses emphasize:", options: [
    { value: "A", text: "Staging and ambiance" }, { value: "B", text: "Inspection reports" }, { value: "C", text: "Themed experiences" }, { value: "D", text: "Utility cost savings" },
  ] },
  { question: "You build trust by:", options: [
    { value: "A", text: "Personal connection" }, { value: "B", text: "Consistent results" }, { value: "C", text: "Vulnerability" }, { value: "D", text: "Data transparency" },
  ] },
  { question: "Under stress, your communication becomes:", options: [
    { value: "A", text: "More structured" }, { value: "B", text: "More assertive" }, { value: "C", text: "More withdrawn" }, { value: "D", text: "More reassuring" },
  ] },
  { question: "Your negotiation strength is:", options: [
    { value: "A", text: "Applying pressure" }, { value: "B", text: "Finding win-wins" }, { value: "C", text: "Making concessions" }, { value: "D", text: "Information gathering" }, { value: "E", text: "Quick compromises" }, { value: "F", text: "Fact-based arguments" }, { value: "G", text: "Decisive action" }, { value: "H", text: "Emotional connection" },
  ] },
  { question: "When receiving feedback, you prefer:", options: [
    { value: "A", text: "Direct actionable steps" }, { value: "B", text: "Encouraging reinforcement" }, { value: "C", text: "Detailed written reports" }, { value: "D", text: "Private discussions" },
  ] },
  { question: "Your value proposition is:", options: [
    { value: "A", text: "I inspire decisive action" }, { value: "B", text: "I build collaborative solutions" }, { value: "C", text: "I create memorable experiences" }, { value: "D", text: "I deliver measurable results" },
  ] },
];

type AgentDimensionContribution = Partial<{
  interactionStyle: AgentInteractionStyle;
  focus: AgentFocus;
  stressResponse: StressResponse;
  perceivedValue: string;
  negotiationStyle: string;
}>;

/** Agent answer → dimension contribution mapping (1-indexed by question). */
export const agentAnswerMapping: Record<number, Record<string, AgentDimensionContribution>> = {
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

/** Agent archetype matrix: interactionStyle-focus-stressResponse → approved agent name. */
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
  "Facilitator-Pragmatic-Fawn": "The Collaborator",
};

/**
 * Score agent survey answers (1-indexed map of "A".."H") into the approved
 * agent archetype. Always returns an approved agent name (defaults to
 * "The Collaborator" only if a dimension has no votes, never an invalid name).
 */
export function getAgentArchetypeFromAnswers(answers: Record<string | number, string>): {
  archetype: string;
  interactionStyle: string;
  focus: string;
  stressResponse: string;
  perceivedValue: string;
  negotiationStyle: string;
} {
  const counts: Record<string, Record<string, number>> = {
    interactionStyle: {}, focus: {}, stressResponse: {}, perceivedValue: {}, negotiationStyle: {},
  };
  for (const [num, answer] of Object.entries(answers)) {
    const contribution = agentAnswerMapping[Number(num)]?.[answer];
    if (!contribution) continue;
    for (const [dim, value] of Object.entries(contribution)) {
      counts[dim][value as string] = (counts[dim][value as string] ?? 0) + 1;
    }
  }
  const winner = (dim: string, fallback: string): string => {
    const entries = Object.entries(counts[dim]);
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? fallback;
  };
  const interactionStyle = winner("interactionStyle", "Facilitator");
  const focus = winner("focus", "Pragmatic");
  const stressResponse = winner("stressResponse", "Fawn");
  const perceivedValue = winner("perceivedValue", "Trust");
  const negotiationStyle = winner("negotiationStyle", "Collaborative");
  const triple = `${interactionStyle}-${focus}-${stressResponse}`;
  const archetype = agentArchetypeMatrix[triple] ?? "The Collaborator";
  return { archetype, interactionStyle, focus, stressResponse, perceivedValue, negotiationStyle };
}

// ---------------------------------------------------------------------------
// AGENT → CLIENT compatibility (approved mapping)
// ---------------------------------------------------------------------------

export const agentCompatibility: Record<string, string[]> = {
  "The Creative Guide": ["The Visionary", "The Dreamchaser", "The Harmonizer"],
  "The Trendsetter": ["The Trailblazer", "The Inspirer", "The Organizer"],
  "The Stylist": ["The Visionary", "The Harmonizer", "The Producer"],
  "The Cheerleader": ["The Inspirer", "The Navigator", "The Explorer"],
  "The Analyst": ["The Strategist", "The Closer", "The Supporter"],
  "The Deal Maker": ["The Trailblazer", "The Closer", "The Curator"],
  "The Adapter": ["The Pathfinder", "The Spark", "The Explorer"],
  "The Supporter": ["The Supporter", "The Navigator", "The Harmonizer"],
  "The Refiner": ["The Strategist", "The Organizer", "The Curator"],
  "The Catalyst": ["The Trailblazer", "The Dreamchaser", "The Spark"],
  "The Observer": ["The Visionary", "The Pathfinder", "The Producer"],
  "The Encourager": ["The Inspirer", "The Harmonizer", "The Explorer"],
  "The Coordinator": ["The Organizer", "The Producer", "The Curator"],
  "The Producer": ["The Closer", "The Strategist", "The Supporter"],
  "The Adjuster": ["The Advocate", "The Navigator", "The Spark"],
  "The Collaborator": ["The Supporter", "The Harmonizer", "The Explorer"],
};

/** Approved client archetypes an agent archetype is most compatible with. */
export function getCompatibleClientTypes(agentArchetype: string): string[] {
  const name = normalizeArchetypeName(agentArchetype);
  return (name && agentCompatibility[name]) || [];
}

// ---------------------------------------------------------------------------
// Normalization, approval guards, and display helpers
// ---------------------------------------------------------------------------

const APPROVED_LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const name of [...CLIENT_ARCHETYPES, ...AGENT_ARCHETYPES]) {
    map[name.toLowerCase()] = name;
  }
  return map;
})();

/**
 * Normalize a stored/display archetype string to its canonical approved casing.
 * Handles lowercase/uppercase/slug variants and an optional missing "The ".
 * Returns null when the value does not correspond to an approved archetype.
 */
export function normalizeArchetypeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let cleaned = String(raw).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  let lower = cleaned.toLowerCase();
  if (APPROVED_LOOKUP[lower]) return APPROVED_LOOKUP[lower];
  if (!lower.startsWith("the ")) {
    const withThe = "the " + lower;
    if (APPROVED_LOOKUP[withThe]) return APPROVED_LOOKUP[withThe];
  }
  return null;
}

export function isApprovedClientArchetype(name: string | null | undefined): boolean {
  const n = normalizeArchetypeName(name);
  return !!n && (CLIENT_ARCHETYPES as readonly string[]).includes(n);
}

export function isApprovedAgentArchetype(name: string | null | undefined): boolean {
  const n = normalizeArchetypeName(name);
  return !!n && (AGENT_ARCHETYPES as readonly string[]).includes(n);
}

/** Display name for an archetype; falls back to a clean title-cased string. */
export function getArchetypeDisplayName(raw: string | null | undefined): string {
  const normalized = normalizeArchetypeName(raw);
  if (normalized) return normalized;
  if (!raw) return "";
  return String(raw)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function getOrientationDisplayName(orientation: string | null | undefined): string {
  switch (orientation) {
    case "Driver": return "Driver";
    case "Collaborator": return "Collaborator";
    default: return orientation || ", ";
  }
}

export function getStyleDisplayName(style: string | null | undefined): string {
  switch (style) {
    case "Design-Focused": return "Design-Focused";
    case "Practical": return "Practical";
    default: return style || ", ";
  }
}

export function getStressResponseDisplayName(stress: string | null | undefined): string {
  switch (stress) {
    case "Freeze": return "Freeze";
    case "Fight": return "Fight";
    case "Flight": return "Flight";
    case "Fawn": return "Fawn";
    default: return stress || ", ";
  }
}

// ---------------------------------------------------------------------------
// AGENT archetype details (for the dashboard "View more" modal). Concise,
// derived from the approved name + compatible client types. Never client copy.
// ---------------------------------------------------------------------------

export interface AgentArchetypeDetail {
  name: string;
  summary: string;
  strengths: string[];
  workingStyle: string;
  idealClients: string[];
}

const AGENT_SUMMARIES: Record<string, { summary: string; strengths: string[]; workingStyle: string }> = {
  "The Creative Guide": { summary: "You blend imagination with steady guidance, helping clients see possibility while keeping the process calm and considered.", strengths: ["Turns vision into a clear, workable plan", "Keeps clients calm while exploring bold options", "Leads with ideas and thoughtful direction"], workingStyle: "Motivating and design-focused, with a calm, analytical approach under pressure." },
  "The Trendsetter": { summary: "You are energetic and forward-looking, bringing momentum and confidence to every step.", strengths: ["Brings energy and momentum", "Confident, decisive guidance under pressure", "Bold, design-forward marketing"], workingStyle: "Motivating and aesthetic, with a directive, take-charge negotiation style." },
  "The Stylist": { summary: "You combine a strong sense of presentation with genuine attentiveness, elevating how options look and feel.", strengths: ["Sharp eye for presentation and fit", "Reads client emotion and adjusts gracefully", "Elevates the client experience"], workingStyle: "Motivating and aesthetic, with an emotive, relationship-led negotiation style." },
  "The Cheerleader": { summary: "You bring warmth, encouragement, and positive energy that keeps clients motivated.", strengths: ["Keeps clients motivated and reassured", "Approachable, encouraging communication", "Builds momentum through positivity"], workingStyle: "Motivating and aesthetic, with an accommodating, supportive negotiation style." },
  "The Analyst": { summary: "You lead with clarity and insight, helping clients make confident decisions grounded in solid reasoning.", strengths: ["Translates detail into clear decisions", "Calm, methodical under complexity", "Insight-driven guidance"], workingStyle: "Motivating and pragmatic, with a calm, analytical approach under pressure." },
  "The Deal Maker": { summary: "You are assertive and results-focused, thriving in negotiation and pushing confidently toward the close.", strengths: ["Confident, competitive negotiator", "Drives momentum toward the close", "Results-first representation"], workingStyle: "Motivating and pragmatic, with a competitive, authority-led negotiation style." },
  "The Adapter": { summary: "You are flexible and resourceful, adjusting your approach to fit each client and situation.", strengths: ["Adjusts quickly to changing needs", "Practical, creative problem-solving", "Keeps deals moving"], workingStyle: "Motivating and pragmatic, with a compromising, adaptable negotiation style." },
  "The Supporter": { summary: "You lead with trust and dependability, giving clients steady, practical guidance they can rely on.", strengths: ["Dependable, trust-building communication", "Practical guidance clients can count on", "Steady through every decision"], workingStyle: "Motivating and pragmatic, with an accommodating, trust-led approach." },
  "The Refiner": { summary: "You bring precision and a high standard, helping clients get the details right with a calm, considered touch.", strengths: ["Meticulous attention to detail", "Calm, quality-focused guidance", "Elevates the quality of every step"], workingStyle: "Facilitating and aesthetic, with a calm, analytical approach under pressure." },
  "The Catalyst": { summary: "You spark action and fresh thinking, helping clients break through hesitation with confident, creative direction.", strengths: ["Inspires action and new ideas", "Confident direction when clients stall", "Creative momentum"], workingStyle: "Facilitating and aesthetic, with a directive, energizing negotiation style." },
  "The Observer": { summary: "You are perceptive and measured, noticing what others miss and guiding clients with thoughtful, low-pressure insight.", strengths: ["Perceptive, insight-led guidance", "Low-pressure, considered approach", "Patient and thorough"], workingStyle: "Facilitating and aesthetic, with a measured, avoidance-aware negotiation style." },
  "The Encourager": { summary: "You combine empathy with genuine support, helping clients feel safe and confident throughout.", strengths: ["Builds trust through empathy", "Reassuring through uncertainty", "Warm, steady support"], workingStyle: "Facilitating and aesthetic, with an emotive, trust-led negotiation style." },
  "The Coordinator": { summary: "You bring structure and dependability, keeping the process organized and secure.", strengths: ["Organized, structured process", "Calm, security-focused guidance", "Clear plans and follow-through"], workingStyle: "Facilitating and pragmatic, with a calm, analytical approach under pressure." },
  "The Producer": { summary: "You are driven and execution-focused, moving clients efficiently toward high-quality outcomes.", strengths: ["Efficient, results-driven execution", "High standards with clear direction", "Strong follow-through"], workingStyle: "Facilitating and pragmatic, with a directive, execution-led negotiation style." },
  "The Adjuster": { summary: "You are steady and adaptable, balancing practicality with a calm, accommodating style.", strengths: ["Balances structure with flexibility", "Calm, accommodating under change", "Keeps things on track"], workingStyle: "Facilitating and pragmatic, with a compromising, security-focused negotiation style." },
  "The Collaborator": { summary: "You lead through partnership and trust, working alongside clients to reach shared decisions.", strengths: ["Partnership-driven, trust-based approach", "Strong shared decision-making", "Cooperative and reassuring"], workingStyle: "Facilitating and pragmatic, with a collaborative, trust-led negotiation style." },
};

/** AGENT archetype details keyed by approved agent name (for the dashboard modal). */
export const AGENT_ARCHETYPE_DETAILS: Record<string, AgentArchetypeDetail> = Object.fromEntries(
  (AGENT_ARCHETYPES as readonly string[]).map((name) => {
    const s = AGENT_SUMMARIES[name];
    return [
      name,
      {
        name,
        summary: s?.summary ?? "Your REQUITY agent archetype reflects how you guide clients through their decisions.",
        strengths: s?.strengths ?? ["Builds rapport and trust with clients", "Guides clients clearly through key decisions", "Adapts to each client's needs"],
        workingStyle: s?.workingStyle ?? "Adapts naturally to different clients.",
        idealClients: agentCompatibility[name] ?? [],
      },
    ];
  })
);

// ---------------------------------------------------------------------------
// Archetype reference (reviewer page), canonical, approved data only.
// ---------------------------------------------------------------------------

export interface ArchetypeReferenceItem {
  name: string;
  summary: string;
  traits: string[];
  compatible: string[];
}

export interface ArchetypeReference {
  clientArchetypes: ArchetypeReferenceItem[];
  agentArchetypes: ArchetypeReferenceItem[];
}

// Reverse map: for each client archetype, which agent archetypes pair with it.
const CLIENT_COMPATIBLE_AGENTS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [agent, clientsList] of Object.entries(agentCompatibility)) {
    for (const client of clientsList) {
      (map[client] ??= []).push(agent);
    }
  }
  return map;
})();

/**
 * Build the reviewer archetype reference from the canonical approved data only.
 * Always returns the 16 approved client and 16 approved agent archetypes (in
 * canonical order), each with a real summary, key trait bullets, and compatible
 * types. Never emits old/invalid archetypes or raw dimension keys.
 */
export function getArchetypeReference(): ArchetypeReference {
  const clientArchetypes: ArchetypeReferenceItem[] = (CLIENT_ARCHETYPES as readonly string[]).map(
    (name) => {
      const def = CLIENT_ARCHETYPE_DETAILS[name];
      const traits = (def?.buyerProfile?.motivations ?? []).slice(0, 3);
      return {
        name,
        summary: def?.summary ?? "Summary not available",
        traits,
        compatible: CLIENT_COMPATIBLE_AGENTS[name] ?? [],
      };
    }
  );

  const agentArchetypes: ArchetypeReferenceItem[] = (AGENT_ARCHETYPES as readonly string[]).map(
    (name) => {
      const def = AGENT_ARCHETYPE_DETAILS[name];
      return {
        name,
        summary: def?.summary ?? "Summary not available",
        traits: (def?.strengths ?? []).slice(0, 3),
        compatible: getCompatibleClientTypes(name),
      };
    }
  );

  return { clientArchetypes, agentArchetypes };
}
