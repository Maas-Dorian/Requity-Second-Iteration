import Stripe from "stripe";

/**
 * Server-only Stripe helper. The secret key, webhook secret, and Price ID are
 * read from the environment and NEVER sent to the browser. The frontend only
 * ever receives a Checkout URL created here.
 *
 * Required env:
 *   STRIPE_SECRET_KEY            sk_test_... / sk_live_...
 *   STRIPE_AGENT_ACCESS_PRICE_ID price_... (one-time $50 Price)
 *   STRIPE_WEBHOOK_SECRET        whsec_... (webhook endpoint signing secret)
 *   PUBLIC_SITE_URL              https://www.requityapp.com
 */

import { PRODUCTION_SITE_URL } from "./env.js";

/** One-time agent platform access fee: $50.00 USD. Never trusted from the browser. */
export const AGENT_ACCESS_AMOUNT_CENTS = 5000;
export const AGENT_ACCESS_CURRENCY = "usd";
/** Version marker stored in Checkout metadata so future pricing changes are auditable. */
export const AGENT_ACCESS_VERSION = "2026_07_v1";
/** Metadata purpose marker; the webhook only grants access when this matches. */
export const AGENT_ACCESS_PURPOSE = "agent_platform_access";

export class StripeConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Stripe is not configured. Missing: ${missing.join(", ")}`);
    this.name = "StripeConfigError";
  }
}

let cachedClient: Stripe | null = null;

/** True when the Stripe secret key is present (payments can be attempted). */
export function hasStripeConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Lazily construct the Stripe client. Throws StripeConfigError when unset. */
export function getStripe(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeConfigError(["STRIPE_SECRET_KEY"]);
  cachedClient = new Stripe(key);
  return cachedClient;
}

export function getAgentAccessPriceId(): string {
  const priceId = process.env.STRIPE_AGENT_ACCESS_PRICE_ID;
  if (!priceId) throw new StripeConfigError(["STRIPE_AGENT_ACCESS_PRICE_ID"]);
  return priceId;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeConfigError(["STRIPE_WEBHOOK_SECRET"]);
  return secret;
}

/** Public site origin for success/cancel URLs (no trailing slash). */
export function getPublicSiteUrl(): string {
  const raw = (process.env.PUBLIC_SITE_URL || "").trim();
  const value = raw || PRODUCTION_SITE_URL;
  return value.replace(/\/+$/, "");
}
