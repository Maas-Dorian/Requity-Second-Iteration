import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  runHandler,
  ensureMethod,
  assertPayloadSize,
  sendJson,
  HttpError,
} from "../_lib/http.js";
import { requireAgent } from "../../backend/lib/auth.js";
import {
  getAgentAccessRecord,
  canAgentAccessPlatform,
  isPayableStatus,
  isResolutionsAgentEmail,
  recordCheckoutStarted,
} from "../../backend/lib/agentAccess.js";
import {
  getStripe,
  getAgentAccessPriceId,
  getPublicSiteUrl,
  AGENT_ACCESS_PURPOSE,
  AGENT_ACCESS_VERSION,
  StripeConfigError,
} from "../../backend/lib/stripe.js";
import { logApiStart } from "../../backend/lib/logger.js";
import { trackServerEvent, ANALYTICS_EVENTS } from "../../backend/lib/vercelAnalytics.js";

const ROUTE = "agent/create-access-checkout-session";

/**
 * POST /api/agent/create-access-checkout-session
 * Requires agent auth. Creates (or safely reuses) a Stripe Checkout Session
 * for the one-time $50 platform access fee and returns ONLY the Checkout URL.
 *
 * Identity comes exclusively from the authenticated session: the route never
 * accepts an agentId, email, price, or amount from the browser. Access is
 * granted later by the verified webhook, never by this route or the redirect.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await runHandler(req, res, async () => {
    ensureMethod(req, "POST");
    assertPayloadSize(req);
    logApiStart(ROUTE);

    const profile = await requireAgent(req);
    if (!profile.agentId) {
      throw new HttpError(404, "Agent profile not found.", "AGENT_NOT_FOUND");
    }

    const access = await getAgentAccessRecord(profile.agentId);
    if (!access) throw new HttpError(404, "Agent profile not found.", "AGENT_NOT_FOUND");

    const siteUrl = getPublicSiteUrl();
    const dashboardUrl = `${siteUrl}/agent/dashboard.html`;

    // Already granted (grandfathered / paid / complimentary): no checkout.
    if (canAgentAccessPlatform(access) || access.legacySchema) {
      sendJson(res, 200, { ok: true, alreadyGranted: true, dashboardUrl });
      return;
    }

    // Assessment must be completed before payment. Resolutions partner agents
    // never take the assessment, so their step is considered satisfied.
    const hasAssessment =
      Boolean(access.archetype || access.archetypeCompletedAt) ||
      isResolutionsAgentEmail(access.email);
    if (!hasAssessment) {
      throw new HttpError(
        409,
        "Complete your REQUITY assessment before activating access.",
        "ASSESSMENT_REQUIRED"
      );
    }

    if (!isPayableStatus(access.accessStatus)) {
      throw new HttpError(
        409,
        "Your access requires review. Contact REQUITY support.",
        "ACCESS_REQUIRES_REVIEW"
      );
    }

    let stripe;
    let priceId: string;
    try {
      stripe = getStripe();
      priceId = getAgentAccessPriceId();
    } catch (error) {
      if (error instanceof StripeConfigError) {
        throw new HttpError(503, "Payments are not available yet. Contact REQUITY support.", "STRIPE_NOT_CONFIGURED");
      }
      throw error;
    }

    // Reuse a still-open Checkout Session when one exists (repeated clicks,
    // returning after a cancel) instead of piling up abandoned sessions.
    if (access.stripeCheckoutSessionId && access.accessStatus === "checkout_started") {
      try {
        const existing = await stripe.checkout.sessions.retrieve(access.stripeCheckoutSessionId);
        if (existing.status === "open" && existing.url) {
          sendJson(res, 200, { ok: true, url: existing.url, reused: true });
          return;
        }
      } catch {
        // Session unknown/expired: fall through and create a fresh one.
      }
    }

    // Server-side agent identity + email only. Never from the request body.
    const agentEmail = (access.email ?? profile.email ?? "").trim().toLowerCase();

    // Create or reuse the Stripe Customer for this agent.
    let customerId = access.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          ...(agentEmail ? { email: agentEmail } : {}),
          ...(access.displayName ? { name: access.displayName } : {}),
          metadata: { purpose: AGENT_ACCESS_PURPOSE, agent_id: access.agentId },
        },
        { idempotencyKey: `agent_access_customer:${access.agentId}` }
      );
      customerId = customer.id;
    }

    // Idempotency bucket: rapid repeated clicks inside the same 10-minute
    // window return the SAME session instead of creating duplicates.
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: access.agentId,
        metadata: {
          purpose: AGENT_ACCESS_PURPOSE,
          agent_id: access.agentId,
          access_version: AGENT_ACCESS_VERSION,
        },
        payment_intent_data: {
          metadata: {
            purpose: AGENT_ACCESS_PURPOSE,
            agent_id: access.agentId,
            access_version: AGENT_ACCESS_VERSION,
          },
        },
        success_url: `${siteUrl}/agent/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/agent/activate-access.html?payment=cancelled`,
      },
      { idempotencyKey: `agent_access_checkout:${access.agentId}:${bucket}` }
    );

    if (!session.url) {
      throw new HttpError(502, "Stripe did not return a Checkout URL. Try again.", "STRIPE_NO_URL");
    }

    await recordCheckoutStarted({
      agentId: access.agentId,
      checkoutSessionId: session.id,
      customerId,
    });

    await trackServerEvent(ANALYTICS_EVENTS.AGENT_CHECKOUT_SESSION_CREATED, {
      amount: 50,
      currency: "usd",
      access_status_before: access.accessStatus,
    });

    // The browser only ever receives the Checkout URL. No keys, no session
    // object, no price internals.
    sendJson(res, 200, { ok: true, url: session.url });
  });
}
