import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, sendJson, HttpError } from "../_lib/http.js";
import { requireAgent } from "../../backend/lib/auth.js";
import {
  getAgentAccessRecord,
  getAgentOnboardingState,
  canAgentAccessPlatform,
  accessStatusLabel,
  markAgentPaymentRequired,
} from "../../backend/lib/agentAccess.js";
import {
  AGENT_ARCHETYPE_DETAILS,
  normalizeArchetypeName,
} from "../../backend/lib/archetypes.js";

const ROUTE = "agent/access-status";

/**
 * GET  /api/agent/access-status
 * POST /api/agent/access-status  (body ignored; acknowledges assessment results)
 *
 * Requires agent auth. GET returns the caller's platform access state,
 * onboarding state, and (when the assessment is complete) their archetype
 * results copy for the assessment-results page. POST records that the agent
 * clicked Continue on the results page (assessment_required moves to
 * payment_required); it can never grant access.
 *
 * Safe fields only: no Stripe secrets, no card data, no tokens. The archetype
 * copy is the same approved public summary shown on the dashboard; internal
 * matching weights and scoring formulas are never included.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    if (req.method !== "GET" && req.method !== "POST") {
      throw new HttpError(405, "Method not allowed. Expected GET or POST.");
    }

    const profile = await requireAgent(req);
    if (!profile.agentId) {
      throw new HttpError(404, "Agent profile not found.", "AGENT_NOT_FOUND");
    }

    let access = await getAgentAccessRecord(profile.agentId);
    if (!access) throw new HttpError(404, "Agent profile not found.", "AGENT_NOT_FOUND");

    // POST: the agent viewed their results and clicked Continue. Bookkeeping
    // only; never grants access, never touches finalized statuses.
    if (req.method === "POST" && access.accessStatus === "assessment_required") {
      await markAgentPaymentRequired(profile.agentId);
      access = (await getAgentAccessRecord(profile.agentId)) ?? access;
    }

    const onboardingState = getAgentOnboardingState(access);

    // Approved archetype results copy (safe, already shown on the dashboard).
    let results: Record<string, unknown> | null = null;
    const archetypeName = normalizeArchetypeName(access.archetype);
    if (archetypeName) {
      const detail = AGENT_ARCHETYPE_DETAILS[archetypeName];
      if (detail) {
        results = {
          archetype: detail.name,
          workingStyle: detail.workingStyle,
          summary: detail.summary,
          strengths: detail.strengths,
        };
      }
    }

    sendJson(res, 200, {
      ok: true,
      accessStatus: access.accessStatus,
      accessStatusLabel: accessStatusLabel(access.accessStatus),
      canAccess: canAgentAccessPlatform(access) || access.legacySchema,
      paymentRequired: access.paymentRequired && !access.legacySchema,
      onboardingState: access.legacySchema ? "access_granted" : onboardingState,
      stripePaymentStatus: access.stripePaymentStatus,
      paidAt: access.stripePaidAt,
      complimentaryAccess: access.complimentaryAccess,
      grandfathered: Boolean(access.grandfatheredAt) || access.legacySchema,
      results,
    });
  });
}
