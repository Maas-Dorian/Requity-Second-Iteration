import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getSupabaseAdmin } from "../../backend/lib/supabaseAdmin.js";
import { isMissingTableError } from "../../backend/lib/supabaseWrite.js";
import {
  getStripe,
  getStripeWebhookSecret,
  StripeConfigError,
} from "../../backend/lib/stripe.js";
import {
  grantAgentAccessFromStripe,
  markAgentPaymentFailed,
  markAgentCheckoutExpired,
  markAgentPaymentRefunded,
  markAgentPaymentDisputed,
  getAgentAccessByCheckoutSession,
} from "../../backend/lib/agentAccess.js";
import {
  sendAgentAccessPaymentConfirmedEmail,
  sendReviewerAgentAccessPaymentEmail,
} from "../../backend/lib/email.js";

/**
 * POST /api/stripe/webhook
 *
 * The ONLY place platform access can be granted from a payment. Security:
 *   - the RAW request body (never parsed/reformatted JSON) is verified against
 *     the Stripe-Signature header with STRIPE_WEBHOOK_SECRET
 *   - invalid or missing signatures are rejected with 400
 *   - every event id is recorded in stripe_webhook_events; a replayed event
 *     is acknowledged with 200 but never processed twice
 *   - metadata purpose, amount, and currency are verified before granting
 *
 * Handled events:
 *   checkout.session.completed / checkout.session.async_payment_succeeded
 *     -> grantAgentAccessFromStripe (idempotent) + confirmation email
 *   checkout.session.async_payment_failed -> access_status = payment_failed
 *   checkout.session.expired -> back to payment_required (if not granted)
 *   charge.refunded -> access_status = refunded (blocks access by policy)
 *   charge.dispute.created -> access_status = suspended
 */

// Stripe signature verification REQUIRES the raw body: disable the parser.
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length) {
        resolve(Buffer.concat(chunks));
        return;
      }
      // Defensive fallback: if a platform helper consumed the stream but kept
      // the body as the ORIGINAL raw string/buffer, verification can still
      // use it. A parsed (object) body is unusable and correctly fails.
      const body = (req as { body?: unknown }).body;
      if (typeof body === "string") resolve(Buffer.from(body));
      else if (Buffer.isBuffer(body)) resolve(body);
      else resolve(Buffer.alloc(0));
    });
    req.on("error", reject);
  });
}

/** Record the event id; returns false when this event was already processed. */
async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from("stripe_webhook_events").insert({
      id: event.id,
      event_type: event.type,
      status: "processing",
    });
    if (error) {
      // Unique violation: this event id was already received. Only a
      // successfully processed event is skipped; a previous failure may be
      // retried (the grant function itself is idempotent).
      if ((error as { code?: string }).code === "23505") {
        const { data } = await supabase
          .from("stripe_webhook_events")
          .select("status")
          .eq("id", event.id)
          .maybeSingle();
        return (data as { status?: string } | null)?.status !== "processed";
      }
      if (isMissingTableError(error)) {
        console.error("[stripe/webhook] stripe_webhook_events table missing; run migration 0018.");
        return true; // process anyway; grant function is itself idempotent
      }
      throw new Error(`claimEvent failed: ${error.message}`);
    }
    return true;
  } catch (error) {
    if (isMissingTableError(error)) return true;
    throw error;
  }
}

async function finishEvent(eventId: string, status: "processed" | "error", errorMessage?: string) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("stripe_webhook_events")
      .update({
        status,
        processed_at: new Date().toISOString(),
        error_message: errorMessage ?? null,
      })
      .eq("id", eventId);
  } catch {
    // Bookkeeping only; never fail the webhook response over it.
  }
}

/** Resolve the agent id for a Checkout Session (metadata first, then lookup). */
async function agentIdForSession(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromMetadata = (session.metadata?.agent_id ?? "").trim();
  if (fromMetadata) return fromMetadata;
  const fromReference = (session.client_reference_id ?? "").trim();
  if (fromReference) return fromReference;
  const bySession = await getAgentAccessByCheckoutSession(session.id);
  return bySession?.agentId ?? null;
}

async function handlePaidSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const agentId = await agentIdForSession(session);
  if (!agentId) {
    console.error("[stripe/webhook] paid session with no resolvable agent:", session.id);
    return;
  }
  const result = await grantAgentAccessFromStripe({
    agentId,
    checkoutSessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    customerId:
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    amountTotal: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: session.currency ?? null,
    metadataPurpose: session.metadata?.purpose ?? null,
    paymentMethodType: Array.isArray(session.payment_method_types)
      ? session.payment_method_types[0] ?? null
      : null,
  });

  if (!result.granted) {
    console.error("[stripe/webhook] payment received but access NOT granted:", {
      sessionId: session.id,
      reason: result.reason,
    });
    return;
  }
  if (result.alreadyGranted) return; // replay: no duplicate email/notification

  // Confirmation emails, deduped by Checkout Session id, sent only now that
  // the webhook (not the browser) confirmed payment. Failures never 500 the
  // webhook; Stripe retries would only duplicate work the dedupe layer stops.
  try {
    await sendAgentAccessPaymentConfirmedEmail({
      checkoutSessionId: session.id,
      agentEmail: result.access.email,
      agentName: result.access.displayName,
    });
    await sendReviewerAgentAccessPaymentEmail({
      checkoutSessionId: session.id,
      agentName: result.access.displayName,
      agentEmail: result.access.email,
    });
  } catch (error) {
    console.error("[stripe/webhook] confirmation email failed:", error);
  }
}

/** Resolve the agent for a charge via its payment intent metadata / lookup. */
async function agentIdForCharge(charge: Stripe.Charge): Promise<string | null> {
  const fromMetadata = (charge.metadata?.agent_id ?? "").trim();
  if (fromMetadata) return fromMetadata;
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("agents")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  let stripe;
  let webhookSecret: string;
  try {
    stripe = getStripe();
    webhookSecret = getStripeWebhookSecret();
  } catch (error) {
    if (error instanceof StripeConfigError) {
      console.error("[stripe/webhook] not configured:", error.missing.join(", "));
      res.status(503).json({ error: "Stripe webhook is not configured." });
      return;
    }
    throw error;
  }

  const signature = req.headers["stripe-signature"];
  const signatureValue = Array.isArray(signature) ? signature[0] : signature;
  if (!signatureValue) {
    res.status(400).json({ error: "Missing Stripe-Signature header." });
    return;
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signatureValue, webhookSecret);
  } catch (error) {
    // Invalid signature or unreadable body: reject. Never log the payload.
    console.error(
      "[stripe/webhook] signature verification failed:",
      error instanceof Error ? error.message : "unknown"
    );
    res.status(400).json({ error: "Invalid Stripe webhook signature." });
    return;
  }

  try {
    // Idempotency: acknowledge (200) replayed events without reprocessing.
    const isNewEvent = await claimEvent(event);
    if (!isNewEvent) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await handlePaidSession(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if ((session.metadata?.purpose ?? "") === "agent_platform_access") {
          const agentId = await agentIdForSession(session);
          if (agentId) await markAgentPaymentFailed(agentId);
        }
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if ((session.metadata?.purpose ?? "") === "agent_platform_access") {
          const agentId = await agentIdForSession(session);
          if (agentId) await markAgentCheckoutExpired(agentId);
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        // Only full refunds of the access payment withdraw access. Partial
        // refunds are left for reviewer review (no automatic state change).
        if (charge.refunded === true) {
          const agentId = await agentIdForCharge(charge);
          if (agentId) await markAgentPaymentRefunded(agentId);
        } else {
          console.log("[stripe/webhook] partial refund flagged for reviewer review:", {
            chargeId: charge.id,
          });
        }
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId);
          const agentId = await agentIdForCharge(charge);
          if (agentId) await markAgentPaymentDisputed(agentId);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged and ignored.
        break;
    }
    await finishEvent(event.id, "processed");
    res.status(200).json({ received: true });
  } catch (error) {
    // Processing failure: record it and return 500 so Stripe retries later.
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[stripe/webhook] processing failed:", { type: event.type, message });
    await finishEvent(event.id, "error", message.slice(0, 500));
    res.status(500).json({ error: "Webhook processing failed." });
  }
}
