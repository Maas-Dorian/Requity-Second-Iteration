import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHandler, ensureMethod, sendJson } from "../_lib/http.js";
import { listReviewerQueue, listPairedClients } from "../../backend/lib/reviewerMatches.js";
import { getLatestAgentPaymentStatuses } from "../../backend/lib/payments.js";
import {
  listReviewerAssessmentLeads,
  leadIsIncomplete,
} from "../../backend/lib/assessmentLeads.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/matches";

/**
 * GET /api/reviewer/matches
 * Requires reviewer/admin auth. Returns the reviewer queues:
 *  - queue / upForReview: completed clients awaiting a reviewer match
 *  - pairedClients: clients already matched/assigned to an agent
 * Incomplete assessments are served by /api/reviewer/assessment-leads; the
 * incomplete COUNT is included here only for the classification log.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "GET");
    logApiStart(ROUTE);

    await requireReviewer(req);

    try {
      const [queue, pairedClients, agentPaymentStatuses] = await Promise.all([
        listReviewerQueue(),
        listPairedClients(),
        getLatestAgentPaymentStatuses(),
      ]);

      // Attach the paired AGENT's current payment status so the paired view
      // can show an agent payment pill without a second fetch. Consumer
      // clients never have a payment status.
      for (const p of pairedClients as any[]) {
        const agentRec = p.agentId ? agentPaymentStatuses.get(p.agentId) ?? null : null;
        p.agentPaymentStatus = agentRec ? agentRec.status : null;
        p.agentPaymentLabel = agentRec ? agentRec.statusLabel : null;
      }

      // Incomplete count for the classification log only (never blocks the queue).
      let incompleteCount = 0;
      try {
        const leads = await listReviewerAssessmentLeads({});
        incompleteCount = (leads ?? []).filter((l) => leadIsIncomplete(l)).length;
      } catch (error) {
        logSupabaseError(`${ROUTE}:incomplete-count`, error);
      }

      console.log("REVIEWER_QUEUE_CLASSIFICATION", {
        incompleteCount,
        upForReviewCount: queue.length,
        pairedCount: pairedClients.length,
      });

      sendJson(res, 200, { queue, upForReview: queue, pairedClients });
    } catch (error) {
      logSupabaseError(ROUTE, error);
      throw error;
    }
  });
}
