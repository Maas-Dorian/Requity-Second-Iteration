import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireString,
  optionalString,
  getQueryParam,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import {
  listReviewerPayments,
  setReviewerPaymentStatus,
  isPaymentStatus,
  PAYMENT_STATUSES,
} from "../../backend/lib/payments.js";
import { requireReviewer } from "../../backend/lib/auth.js";
import { logApiStart, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "reviewer/payments";

/**
 * GET  /api/reviewer/payments?status=
 *   Reviewer Agent Payments tab payload: all non-archived agents, each with
 *   its CURRENT payment status (agents never updated default to unpaid).
 *   Agents are REQUITY's paying clients; consumer clients are never listed.
 *   Includes summary counts (unpaid agents, matches changed this week).
 *
 * POST /api/reviewer/payments
 *   Body: { entityType: "agent", entityId: <agent id>, status, amountCents?, note? }
 *   Appends one AGENT payment status update (history is kept, nothing is
 *   deleted). Client, lead, and match payment updates are rejected.
 *
 * Requires reviewer/admin auth for both methods.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    logApiStart(ROUTE);
    const reviewer = await requireReviewer(req);

    if (req.method === "GET") {
      const status = getQueryParam(req, "status") ?? null;
      if (status && !isPaymentStatus(status)) {
        throw new HttpError(400, `Invalid status. Expected one of: ${PAYMENT_STATUSES.join(", ")}.`);
      }
      try {
        const result = await listReviewerPayments({ status });
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        logSupabaseError(ROUTE, error);
        throw error;
      }
      return;
    }

    ensureMethod(req, "POST");
    const body = getJsonBody(req);
    const entityType = requireString(body, "entityType");
    if (entityType !== "agent") {
      throw new HttpError(400, "Payment statuses are tracked for agents only. Use entityType \"agent\" with an agent id.");
    }
    const entityId = requireString(body, "entityId");
    const status = requireString(body, "status");
    if (!isPaymentStatus(status)) {
      throw new HttpError(400, `Invalid status. Expected one of: ${PAYMENT_STATUSES.join(", ")}.`);
    }
    let amountCents: number | null = null;
    if (body.amountCents !== undefined && body.amountCents !== null && body.amountCents !== "") {
      const parsed = Number(body.amountCents);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) {
        throw new HttpError(400, "Invalid amountCents.");
      }
      amountCents = Math.round(parsed);
    }

    try {
      const record = await setReviewerPaymentStatus({
        entityType,
        entityId,
        status,
        amountCents,
        note: optionalString(body, "note") ?? null,
        updatedBy: reviewer.profileId ?? null,
      });
      sendJson(res, 200, { ok: true, record });
    } catch (error) {
      logSupabaseError(ROUTE, error, { entityType, status });
      throw error;
    }
  });
}
