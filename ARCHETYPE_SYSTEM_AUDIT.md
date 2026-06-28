# REQUITY Archetype System Audit

This document records the canonical archetype system after the consolidation work.
There are **two separate systems**, Client archetypes and Agent archetypes, that
intentionally share two names (`The Producer`, `The Supporter`) kept apart by context.
Never mix client copy into agent explanations.

## Canonical source of truth

**`backend/lib/archetypes.ts`** is the single source of truth. It is re-exported from
`backend/lib/index.ts` (`export * from "./archetypes.js"`).

### Required exports (all present)

- `surveyQuestions`, client survey questions
- `assignArchetype`, client scoring → `ArchetypeResult`
- `getArchetypeGuidelines`, client guidelines by approved name
- `getArchetypeDisplayName`, `getOrientationDisplayName`, `getStyleDisplayName`, `getStressResponseDisplayName`
- `agentSurveyQuestions`, `agentAnswerMapping`, `agentArchetypeMatrix`
- `getAgentArchetypeFromAnswers`, `getCompatibleClientTypes`
- `CLIENT_ARCHETYPES`, `AGENT_ARCHETYPES`
- `CLIENT_ARCHETYPE_DETAILS`, `CLIENT_GUIDELINES`
- `AGENT_ARCHETYPE_DETAILS` (for the dashboard modal)
- `agentCompatibility`
- `normalizeArchetypeName`, `isApprovedClientArchetype`, `isApprovedAgentArchetype`

## Approved client archetypes (16)

The Visionary, The Trailblazer, The Dreamchaser, The Inspirer, The Strategist,
The Closer, The Pathfinder, The Advocate, The Curator, The Spark, The Explorer,
The Harmonizer, The Organizer, The Producer, The Navigator, The Supporter.

Each maps from an `orientation-style-stressResponse` triple:

| Triple | Client archetype |
|---|---|
| Driver-Design-Focused-Freeze | The Visionary |
| Driver-Design-Focused-Fight | The Trailblazer |
| Driver-Design-Focused-Flight | The Dreamchaser |
| Driver-Design-Focused-Fawn | The Inspirer |
| Driver-Practical-Freeze | The Strategist |
| Driver-Practical-Fight | The Closer |
| Driver-Practical-Flight | The Pathfinder |
| Driver-Practical-Fawn | The Advocate |
| Collaborator-Design-Focused-Freeze | The Curator |
| Collaborator-Design-Focused-Fight | The Spark |
| Collaborator-Design-Focused-Flight | The Explorer |
| Collaborator-Design-Focused-Fawn | The Harmonizer |
| Collaborator-Practical-Freeze | The Organizer |
| Collaborator-Practical-Fight | The Producer |
| Collaborator-Practical-Flight | The Navigator |
| Collaborator-Practical-Fawn | The Supporter |

Legacy key aliases are normalized in `canonicalTripleKey()`:
`Collaborator-Design-{Freeze|Fight|Flight|Fawn}` → `Collaborator-Design-Focused-…`.

## Approved agent archetypes (16)

The Creative Guide, The Trendsetter, The Stylist, The Cheerleader, The Analyst,
The Deal Maker, The Adapter, The Supporter, The Refiner, The Catalyst, The Observer,
The Encourager, The Coordinator, The Producer, The Adjuster, The Collaborator.

`agentArchetypeMatrix` (interactionStyle-focus-stressResponse → agent name):

| Triple | Agent archetype |
|---|---|
| Motivator-Aesthetic-Freeze | The Creative Guide |
| Motivator-Aesthetic-Fight | The Trendsetter |
| Motivator-Aesthetic-Flight | The Stylist |
| Motivator-Aesthetic-Fawn | The Cheerleader |
| Motivator-Pragmatic-Freeze | The Analyst |
| Motivator-Pragmatic-Fight | The Deal Maker |
| Motivator-Pragmatic-Flight | The Adapter |
| Motivator-Pragmatic-Fawn | The Supporter |
| Facilitator-Aesthetic-Freeze | The Refiner |
| Facilitator-Aesthetic-Fight | The Catalyst |
| Facilitator-Aesthetic-Flight | The Observer |
| Facilitator-Aesthetic-Fawn | The Encourager |
| Facilitator-Pragmatic-Freeze | The Coordinator |
| Facilitator-Pragmatic-Fight | The Producer |
| Facilitator-Pragmatic-Flight | The Adjuster |
| Facilitator-Pragmatic-Fawn | The Collaborator |

### Agent → client compatibility map (`getCompatibleClientTypes`)

| Agent | Compatible client archetypes |
|---|---|
| The Creative Guide | The Visionary, The Dreamchaser, The Harmonizer |
| The Trendsetter | The Trailblazer, The Inspirer, The Organizer |
| The Stylist | The Visionary, The Harmonizer, The Producer |
| The Cheerleader | The Inspirer, The Navigator, The Explorer |
| The Analyst | The Strategist, The Closer, The Supporter |
| The Deal Maker | The Trailblazer, The Closer, The Curator |
| The Adapter | The Pathfinder, The Spark, The Explorer |
| The Supporter | The Supporter, The Navigator, The Harmonizer |
| The Refiner | The Strategist, The Organizer, The Curator |
| The Catalyst | The Trailblazer, The Dreamchaser, The Spark |
| The Observer | The Visionary, The Pathfinder, The Producer |
| The Encourager | The Inspirer, The Harmonizer, The Explorer |
| The Coordinator | The Organizer, The Producer, The Curator |
| The Producer | The Closer, The Strategist, The Supporter |
| The Adjuster | The Advocate, The Navigator, The Spark |
| The Collaborator | The Supporter, The Harmonizer, The Explorer |

## Exact details included

- **`CLIENT_ARCHETYPE_DETAILS`**, for all 16 client archetypes: `summary`,
  `buyerProfile { motivations, communication, stressReduction }`, and
  `sellerProfile { motivations, communication, stressReduction }`. Wording is the
  approved source copy, verbatim.
- **`CLIENT_GUIDELINES`**, for all 16 client archetypes: `buyer.approaches`,
  `buyer.avoid`, `seller.approaches`, `seller.avoid`, `simultaneous.approaches`,
  `simultaneous.avoid`, `communication.recommended`, `communication.avoid`. Wording
  is the approved source copy, verbatim. (The supplied "The Coordinator" guideline
  block was excluded from CLIENT_GUIDELINES because "The Coordinator" is an agent
  archetype, not an approved client archetype.)
- **`AGENT_ARCHETYPE_DETAILS`**, for all 16 agent archetypes: `name`, `summary`,
  `strengths`, `workingStyle`, `idealClients` (from the approved compatibility map).
  Agent detail copy is concise and derived from the agent name, interaction style,
  focus, stress response, negotiation style, and compatible client types, it never
  reuses client archetype copy.

## Removed invalid / non-approved archetypes

| Invalid name | Where it was | Resolution |
|---|---|---|
| Relationship-Fit Agent | `agent/script.js` fallback, `agent/dashboard.html` modal entry, `backend/lib/agentAssessments.ts` fallback | Removed; deterministic matrix covers all 16 triples, fallback is now the approved `The Collaborator` |
| The Agent Supporter | `backend/lib/matching.ts`, `backend/src/matching.ts`, `agent/dashboard.html` | Renamed to approved `The Supporter` |
| The Agent Producer | `backend/lib/matching.ts`, `backend/src/matching.ts`, `agent/dashboard.html` | Renamed to approved `The Producer` |
| The Planner | `reviewer/index.html` static reference | Replaced with approved client archetypes |
| The Trusted Advisor | `reviewer/index.html` static reference (listed as agent) | Replaced with approved agent archetypes |
| The Strategist (listed under agents) | `reviewer/index.html` static reference | Replaced, `The Strategist` is a client archetype |
| Unknown Agent Type | only `backend/src/agent-survey-questions.legacy.ts` (excluded from build, not user-facing) | Left in legacy file only |
| The Commander / The Innovator / The Diplomat | not found in any user-facing path | n/a |

Invalid **saved** data is handled, not hidden: the agent dashboard shows
`"Retake assessment to complete your archetype"` and the Discover button when a
stored agent archetype is not in the approved list (no silent remap to a random
archetype).

## Where client details render

- Client scoring runs server-side in `backend/lib/clientAssessments.ts`
  (`calculateClientArchetype`) and client-side in `frontend/shared/api.js`
  (`calculateClientArchetype`). Both resolve to approved client names only.
- Client archetype + dimensions are surfaced to **reviewers** in
  `reviewer/script.js` (queue list, client profile panel, match fit cards) and to
  **agents** for their assigned clients in `agent/dashboard.html`.
- The approved buyer/seller/simultaneous/communication guideline copy and the
  archetype definitions are available from the canonical module
  (`CLIENT_ARCHETYPE_DETAILS`, `CLIENT_GUIDELINES`, `getArchetypeGuidelines`) for any
  report surface. NOTE: the public client flow currently ends on a waiting/confirmation
  screen (`client/assessment.html` `#step-waiting`) and does not render a client-facing
  archetype report; no new client report UI was introduced (per "do not redesign UI").

## Where agent details render

- Agent scoring: `backend/lib/agentAssessments.ts` (`calculateAgentArchetype`) using the
  renamed `agentArchetypeMap` in `backend/lib/matching.ts`; client-side preview in
  `agent/script.js`. Both resolve to approved agent names only.
- Agent dashboard pill + "View more" modal: `agent/dashboard.html`
  (`AGENT_ARCHETYPE_DETAILS`, `AGENT_COMPATIBILITY`, `AGENT_WORKING_STYLE`,
  `window.__requityRenderAgentArchetype`). Modal shows: name, summary, strengths,
  working style, and ideal client fit, plus a "Retake assessment" link.
- Reviewer match fit cards show agent archetype names via `backend/lib/reviewerMatches.ts`
  (`buildMatchReason`, ranking), approved names only.

## Files changed

- `backend/lib/archetypes.ts`, **new** canonical module.
- `backend/lib/index.ts`, re-export the canonical module.
- `backend/lib/matching.ts`, renamed `The Agent Supporter`→`The Supporter`,
  `The Agent Producer`→`The Producer` (in `agentArchetypeMap` and `primaryMatchPercentages`).
- `backend/lib/agentAssessments.ts`, removed `Relationship-Fit Agent` fallback → `The Collaborator`.
- `backend/src/matching.ts`, same agent renames (legacy, not compiled; aligned for consistency).
- `agent/script.js`, removed `Relationship-Fit Agent` fallback → `The Collaborator`.
- `agent/dashboard.html`, renamed modal keys to `supporter`/`producer`, removed the
  `relationship-fit agent` entry, added `AGENT_COMPATIBILITY` + `AGENT_WORKING_STYLE`,
  added Working style + Ideal client fit modal sections, added the invalid-archetype guard.
- `reviewer/index.html`, replaced invalid names in the static archetype reference.
- `ARCHETYPE_SYSTEM_AUDIT.md`, this document.

## Tests run

```
npm run build                              # tsc --noEmit → exit 0
node --check frontend/shared/api.js        # OK
node --check client/assessment-script.js   # OK
node --check scripts/generate-config.js    # OK
node --check agent/script.js               # OK
```

## Manual test checklist

1. Complete client assessment → result is one of the 16 approved client archetypes.
2. Client report/result → buyer/seller/stress/communication/avoid details available from
   `CLIENT_ARCHETYPE_DETAILS` + `CLIENT_GUIDELINES` (rendered in reviewer/agent client views;
   public client flow ends on the waiting screen, unchanged).
3. Complete agent assessment → result is one of the 16 approved agent archetypes.
4. Agent dashboard → pill shows only an approved agent archetype.
5. View More modal → agent-specific summary, strengths, working style, and ideal client fit
   (approved compatibility); no invalid/old names.
6. Reviewer/match view → compatibility uses the approved mapping; no `The Agent …`,
   `Relationship-Fit Agent`, `The Planner`, or `The Trusted Advisor`.
7. Code search → no user-facing invalid archetype names remain (only excluded-from-build
   `*.legacy.ts` files and docs may reference old names).
8. Stored invalid agent archetype → dashboard shows "Retake assessment to complete your
   archetype", not a fabricated name.
