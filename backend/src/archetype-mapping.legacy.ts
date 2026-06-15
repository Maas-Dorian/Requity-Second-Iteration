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

export function assignArchetype(answers: any[]): ArchetypeResult {
  // Simple archetype assignment logic
  // This is a simplified version - in reality this would be more complex
  const answerValues = answers.map(a => a.answer);
  
  // Determine orientation (Driver vs Collaborator)
  const driverAnswers = ['just_me', 'decide_quickly', 'lead_process', 'direct_assertive', 'take_charge', 'asap'];
  const collaboratorAnswers = ['partner_spouse', 'family', 'discuss_options', 'collaborate_team', 'work_together', 'steady_pace'];
  
  const driverCount = answerValues.filter(answer => driverAnswers.includes(answer)).length;
  const collaboratorCount = answerValues.filter(answer => collaboratorAnswers.includes(answer)).length;
  
  const orientation = driverCount > collaboratorCount ? 'Driver' : 'Collaborator';
  
  // Determine style (Design-Focused vs Practical)
  const designAnswers = ['design_aesthetics', 'visual_appeal', 'visual_materials'];
  const practicalAnswers = ['practical_features', 'practical_aspects', 'doing_experiencing'];
  
  const designCount = answerValues.filter(answer => designAnswers.includes(answer)).length;
  const practicalCount = answerValues.filter(answer => practicalAnswers.includes(answer)).length;
  
  const style = designCount > practicalCount ? 'Design-Focused' : 'Practical';
  
  // Determine stress response
  const freezeAnswers = ['space_time', 'space_process', 'avoid_postpone', 'step_back'];
  const fightAnswers = ['quick_solutions', 'take_charge', 'direct_assertive'];
  const flightAnswers = ['distraction_humor', 'no_rush', 'flexible_timing'];
  const fawnAnswers = ['extra_reassurance', 'encouragement', 'seek_advice', 'trusted_guidance'];
  
  const freezeCount = answerValues.filter(answer => freezeAnswers.includes(answer)).length;
  const fightCount = answerValues.filter(answer => fightAnswers.includes(answer)).length;
  const flightCount = answerValues.filter(answer => flightAnswers.includes(answer)).length;
  const fawnCount = answerValues.filter(answer => fawnAnswers.includes(answer)).length;
  
  let stressResponse = 'Freeze';
  let maxCount = freezeCount;
  
  if (fightCount > maxCount) {
    stressResponse = 'Fight';
    maxCount = fightCount;
  }
  if (flightCount > maxCount) {
    stressResponse = 'Flight';
    maxCount = flightCount;
  }
  if (fawnCount > maxCount) {
    stressResponse = 'Fawn';
  }
  
  const archetype = `${orientation}-${style}-${stressResponse}`;
  
  // Generate motivations based on archetype
  const motivations = [];
  if (orientation === 'Driver') {
    motivations.push('Takes initiative', 'Prefers control', 'Values efficiency');
  } else {
    motivations.push('Values collaboration', 'Seeks consensus', 'Enjoys teamwork');
  }
  
  if (style === 'Design-Focused') {
    motivations.push('Appreciates aesthetics', 'Values visual appeal');
  } else {
    motivations.push('Focuses on functionality', 'Values practicality');
  }

  // Map to proper archetype names
  const archetypeNameMap: Record<string, string> = {
    'Driver-Design-Focused-Freeze': 'The Visionary',
    'Driver-Design-Focused-Fight': 'The Trailblazer',
    'Driver-Design-Focused-Flight': 'The Dreamchaser',
    'Driver-Design-Focused-Fawn': 'The Inspirer',
    'Driver-Practical-Freeze': 'The Strategist',
    'Driver-Practical-Fight': 'The Closer',
    'Driver-Practical-Flight': 'The Pathfinder',
    'Driver-Practical-Fawn': 'The Advocate',
    'Collaborator-Design-Focused-Freeze': 'The Curator',
    'Collaborator-Design-Focused-Fight': 'The Spark',
    'Collaborator-Design-Focused-Flight': 'The Explorer',
    'Collaborator-Design-Focused-Fawn': 'The Harmonizer',
    'Collaborator-Practical-Freeze': 'The Organizer',
    'Collaborator-Practical-Fight': 'The Producer',
    'Collaborator-Practical-Flight': 'The Navigator',
    'Collaborator-Practical-Fawn': 'The Supporter'
  };

  const archetypeName = archetypeNameMap[archetype] || archetype;
  
  return {
    archetype: archetypeName,
    motivations,
    orientation,
    style,
    stressResponse
  };
}