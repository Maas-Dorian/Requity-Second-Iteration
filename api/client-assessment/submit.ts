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
import { APPRECIATION_STYLE_VALUES } from "../../backend/lib/clientReport.js";
import { logApiStart, logValidationFailure, logSupabaseError } from "../../backend/lib/logger.js";
import { trackServerEvent, ANALYTICS_EVENTS, marketSlug } from "../../backend/lib/vercelAnalytics.js";

const ROUTE = "client-assessment/submit";

/**
 * POST /api/client-assessment/submit
 * Body: { assessmentToken?|token?, source, contact:{fullName,email?,phone?,dateOfBirth?}, answers, result?, agentId?, agentToken? }
 *
 * Public route, validated + rate limited. Valid when it includes either an
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
    const agentSlug = optionalString(body, "agentSlug") ?? null;
    const agentToken = optionalString(body, "agentToken") ?? null;

    // Submission rule:
    //  - qr / agent_link -> require agentToken or agentId (attach to that agent,
    //    no reviewer queue item).
    //  - reviewer        -> require an assessment token (a reviewer-created link).
    //  - client (direct) -> NO token/agent required; routed to the reviewer queue.
    // A token/agent is ONLY mandatory for the reviewer + qr/agent_link paths.
    if (source === "qr" || source === "agent_link") {
      if (!agentToken && !agentId && !agentSlug) {
        logValidationFailure(ROUTE, "missing_agent_reference", { source });
        throw new HttpError(
          400,
          "An agentSlug, agentToken, or agentId is required for qr/agent_link submissions."
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
    // source === "client": no extra reference required, a fresh assessment is
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

    // Transaction intent (buying / selling / both / other). Optional for
    // backward compatibility, but when present it must be valid. Stored
    // separately from archetype answers so it never affects scoring.
    const TRANSACTION_INTENTS = ["buying", "selling", "both", "other"] as const;
    const intentRaw = optionalString(body, "transactionIntent");
    let transactionIntent: "buying" | "selling" | "both" | "other" | null = null;
    if (intentRaw) {
      if (!TRANSACTION_INTENTS.includes(intentRaw as (typeof TRANSACTION_INTENTS)[number])) {
        logValidationFailure(ROUTE, "invalid_transaction_intent", { transactionIntent: intentRaw });
        throw new HttpError(
          400,
          "Invalid transactionIntent. Expected one of: buying, selling, both, other."
        );
      }
      transactionIntent = intentRaw as "buying" | "selling" | "both" | "other";
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
          : transactionIntent === "both"
            ? "Buying and Selling"
            : transactionIntent === "other"
              ? transactionIntentOther
              : null;

    // Validate a city/market string (2 to 120 chars). Metadata only, never scored.
    const cityField = (key: string): string =>
      (optionalString(body, key) ?? "").trim();
    const isValidCity = (v: string): boolean => v.length >= 2 && v.length <= 120;
    const cityError = (): never => {
      logValidationFailure(ROUTE, "invalid_market_city", {});
      throw new HttpError(
        400,
        "Please enter the city or market (2 to 120 characters)."
      );
    };

    const buyingMarketCityRaw = cityField("buyingMarketCity");
    const sellingMarketCityRaw = cityField("sellingMarketCity");
    let marketCity = cityField("marketCity");
    let buyingMarketCity: string | null = null;
    let sellingMarketCity: string | null = null;

    if (transactionIntent === "buying") {
      if (!isValidCity(buyingMarketCityRaw)) cityError();
      buyingMarketCity = buyingMarketCityRaw;
      marketCity = buyingMarketCityRaw;
    } else if (transactionIntent === "selling") {
      if (!isValidCity(sellingMarketCityRaw)) cityError();
      sellingMarketCity = sellingMarketCityRaw;
      marketCity = sellingMarketCityRaw;
    } else if (transactionIntent === "both") {
      if (!isValidCity(buyingMarketCityRaw) || !isValidCity(sellingMarketCityRaw)) cityError();
      buyingMarketCity = buyingMarketCityRaw;
      sellingMarketCity = sellingMarketCityRaw;
      marketCity = `${buyingMarketCityRaw} / ${sellingMarketCityRaw}`;
    } else if (transactionIntent === "other") {
      // Market optional for "other": validate only if provided.
      if (marketCity && !isValidCity(marketCity)) cityError();
    } else {
      // Legacy/no intent: keep the original single-field requirement.
      if (!isValidCity(marketCity)) cityError();
    }

    // Optional structured state per market (metadata, never scored, max 60 chars).
    const stateField = (key: string): string | null => {
      const v = (optionalString(body, key) ?? "").trim();
      return v ? v.slice(0, 60) : null;
    };
    const buyingMarketState = stateField("buyingMarketState");
    const sellingMarketState = stateField("sellingMarketState");
    const marketState = stateField("marketState");

    // --- Final assessment questions (never scored) -----------------------
    // appreciation_style: optional for backward compatibility with in-flight
    // sessions on the previous question set, but when present it must be one
    // of the five approved values.
    const appreciationRaw =
      optionalString(body, "appreciationStyle") ??
      optionalString(body, "appreciation_style") ??
      null;
    let appreciationStyle: string | null = null;
    if (appreciationRaw) {
      const normalized = appreciationRaw.trim().toLowerCase();
      if (!(APPRECIATION_STYLE_VALUES as readonly string[]).includes(normalized)) {
        logValidationFailure(ROUTE, "invalid_appreciation_style", {});
        throw new HttpError(400, "Invalid appreciation style selection.");
      }
      appreciationStyle = normalized;
    }

    // agent_expectations_notes: optional long-form text. Trim outer whitespace
    // only (line breaks inside the answer are preserved), max 5,000 characters.
    const notesValue = body["agentExpectationsNotes"] ?? body["agent_expectations_notes"];
    let agentExpectationsNotes: string | null = null;
    if (notesValue !== null && notesValue !== undefined && notesValue !== "") {
      if (typeof notesValue !== "string") {
        logValidationFailure(ROUTE, "invalid_agent_expectations_notes", {});
        throw new HttpError(400, "Invalid expectations text.");
      }
      const trimmed = notesValue.trim();
      if (trimmed.length > 5000) {
        logValidationFailure(ROUTE, "agent_expectations_notes_too_long", {
          length: trimmed.length,
        });
        throw new HttpError(400, "Expectations text must be 5,000 characters or fewer.");
      }
      agentExpectationsNotes = trimmed || null;
    }

    // Safe categorical analytics context. Never includes contact info,
    // answers, or the open-ended response.
    const analyticsTransactionType =
      transactionIntent === "both"
        ? "buying_and_selling"
        : transactionIntent === "other"
          ? "general"
          : transactionIntent;
    const analyticsMarket = marketSlug(buyingMarketCity ?? sellingMarketCity ?? marketCity);

    try {
      const leadId = optionalString(body, "leadId") ?? null;
      const result = await submitClientAssessmentWithContact({
        token,
        source,
        contact,
        answers,
        agentId,
        agentSlug,
        agentToken,
        archetypeResult,
        leadId,
        transactionIntent,
        transactionIntentLabel,
        transactionIntentOther,
        marketCity: marketCity || null,
        buyingMarketCity,
        sellingMarketCity,
        buyingMarketState,
        sellingMarketState,
        marketState,
        appreciationStyle,
        agentExpectationsNotes,
      });
      // Source-of-truth completion event: fires ONLY after the database write
      // succeeded. Analytics failures never affect the API response.
      await trackServerEvent(ANALYTICS_EVENTS.CLIENT_ASSESSMENT_COMPLETED, {
        market: analyticsMarket,
        transaction_type: analyticsTransactionType,
        total_questions: Object.keys(answers ?? {}).length + 2,
        source_page: source,
        has_expectations_notes: Boolean(agentExpectationsNotes),
        has_appreciation_style: Boolean(appreciationStyle),
        assessment_version: "v2_final_questions",
        is_returning_session: Boolean(leadId),
        submission_type: leadId ? "resumed" : "new",
      });
      sendJson(res, 200, result);
    } catch (error) {
      logSupabaseError(ROUTE, error, { source });
      await trackServerEvent(ANALYTICS_EVENTS.CLIENT_ASSESSMENT_SUBMISSION_FAILED, {
        failure_stage: error instanceof HttpError && error.status < 500 ? "validation" : "database",
        transaction_type: analyticsTransactionType,
        market: analyticsMarket,
        error_code:
          error instanceof HttpError ? String(error.status) : "unknown",
      });
      throw asSubmitError(error, "CLIENT_ASSESSMENT_SUBMIT_FAILED", "public.clients");
    }
  });
}
