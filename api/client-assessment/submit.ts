import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  getJsonBody,
  requireEnum,
  requireObject,
  requireString,
  optionalString,
  optionalEmail,
  optionalDate,
  sanitizePhone,
  requireAnswers,
  assertPayloadSize,
  getClientIp,
  sendJson,
  HttpError,
  asSubmitError,
} from "../_lib/http.js";
import {
  submitClientAssessmentWithContact,
  type ClientAnswers,
  type ClientArchetypeResult,
} from "../../backend/lib/clientAssessments.js";
import { checkRateLimit } from "../../backend/lib/rateLimit.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";

const ROUTE = "client-assessment/submit";

/**
 * POST /api/client-assessment/submit
 * Body: { assessmentToken?|token?, source, contact:{fullName,email?,phone?,dateOfBirth?}, answers, result?, agentId?, agentToken? }
 *
 * Public route — validated + rate limited. Valid when it includes either an
 * assessmentToken/token OR an agentToken/agentId. Source-specific rule:
 *   - qr / agent_link -> require agentToken or agentId; attach to that agent;
 *     no reviewer queue item.
 *   - reviewer        -> require assessmentToken/token; create a reviewer queue item.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const ip = getClientIp(req);
    const rl = checkRateLimit(ip, "client_submit");
    if (!rl.allowed) {
      logValidationFailure(ROUTE, "rate_limited", { ip });
      throw new HttpError(429, rl.reason ?? "Too many requests.");
    }

    const body = getJsonBody(req);

    const source = requireEnum(body, "source", ["qr", "agent_link", "reviewer", "client"] as const);
    // `assessmentToken` is accepted as an alias for `token`.
    const token = optionalString(body, "assessmentToken") ?? optionalString(body, "token") ?? null;
    const agentId = optionalString(body, "agentId") ?? null;
    const agentToken = optionalString(body, "agentToken") ?? null;

    // Submission rule:
    //  - qr / agent_link -> require agentToken or agentId (attach to that agent,
    //    no reviewer queue item).
    //  - reviewer        -> require an assessment token (a reviewer-created link).
    //  - client (direct) -> NO token/agent required; routed to the reviewer queue.
    // A token/agent is ONLY mandatory for the reviewer + qr/agent_link paths.
    if (source === "qr" || source === "agent_link") {
      if (!agentToken && !agentId) {
        logValidationFailure(ROUTE, "missing_agent_reference", { source });
        throw new HttpError(
          400,
          "An agentToken or agentId is required for qr/agent_link submissions."
        );
      }
    } else if (source === "reviewer") {
      if (!token) {
        logValidationFailure(ROUTE, "missing_assessment_token", { source });
        throw new HttpError(
          400,
          "An assessmentToken/token is required for reviewer submissions."
        );
      }
    }
    // source === "client": no extra reference required — a fresh assessment is
    // created and routed to the REQUITY reviewer queue.

    const contactRaw = requireObject(body, "contact");
    const contact = {
      fullName: requireString(contactRaw, "fullName"),
      email: optionalEmail(contactRaw, "email") ?? null,
      phone: sanitizePhone(contactRaw["phone"]) ?? null,
      dateOfBirth: optionalDate(contactRaw, "dateOfBirth") ?? null,
    };

    const answers = requireAnswers(body, "answers") as ClientAnswers;
    const archetypeResult =
      body.result && typeof body.result === "object"
        ? (body.result as ClientArchetypeResult)
        : null;

    // Transaction intent (buying / selling / other). Optional for backward
    // compatibility, but when present it must be valid; "other" requires a
    // non-empty custom description. Stored separately from archetype answers so
    // it never affects scoring.
    const TRANSACTION_INTENTS = ["buying", "selling", "other"] as const;
    const intentRaw = optionalString(body, "transactionIntent");
    let transactionIntent: "buying" | "selling" | "other" | null = null;
    if (intentRaw) {
      if (!TRANSACTION_INTENTS.includes(intentRaw as (typeof TRANSACTION_INTENTS)[number])) {
        logValidationFailure(ROUTE, "invalid_transaction_intent", { transactionIntent: intentRaw });
        throw new HttpError(400, "Invalid transactionIntent. Expected one of: buying, selling, other.");
      }
      transactionIntent = intentRaw as "buying" | "selling" | "other";
    }
    const transactionIntentOther =
      transactionIntent === "other"
        ? (optionalString(body, "transactionIntentOther") ?? "").trim() || null
        : null;
    if (transactionIntent === "other" && !transactionIntentOther) {
      logValidationFailure(ROUTE, "missing_transaction_intent_other", {});
      throw new HttpError(400, "Please describe what you’re looking to do.");
    }
    const transactionIntentLabel =
      transactionIntent === "buying"
        ? "Buying"
        : transactionIntent === "selling"
          ? "Selling"
          : transactionIntent === "other"
            ? transactionIntentOther
            : null;

    // City/market the client wants to buy/sell in. Required, trimmed, 2–120
    // chars. Metadata only — it never affects archetype scoring.
    const marketCity = (optionalString(body, "marketCity") ?? "").trim();
    if (marketCity.length < 2 || marketCity.length > 120) {
      logValidationFailure(ROUTE, "invalid_market_city", { length: marketCity.length });
      throw new HttpError(400, "Please enter the city or market you’re looking in (2–120 characters).");
    }

    try {
      const result = await submitClientAssessmentWithContact({
        token,
        source,
        contact,
        answers,
        agentId,
        agentToken,
        archetypeResult,
        leadId: optionalString(body, "leadId") ?? null,
        transactionIntent,
        transactionIntentLabel,
        transactionIntentOther,
        marketCity,
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { source });
      throw asSubmitError(error, "CLIENT_ASSESSMENT_SUBMIT_FAILED", "public.clients");
    }
  });
}
