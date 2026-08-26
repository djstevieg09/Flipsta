import Stripe from "stripe";

/**
 * Stripe Connect wrapper implementing the escrow mechanic from Section 6:
 * "Stripe Connect, and not release funds until delivered." We use manual
 * capture + a delayed transfer to the seller's connected account instead of
 * an immediate one, so funds sit on the platform balance until a delivery
 * (or the seller's optional 2-week extended hold) triggers release.
 *
 * Needs STRIPE_SECRET_KEY set — see INFRASTRUCTURE_TODO.md. Falls back to a
 * clearly-labelled stub in dev so the rest of the app runs without a Stripe
 * account configured yet.
 */
const key = process.env.STRIPE_SECRET_KEY;

// No pinned apiVersion — uses the connected Stripe account's default so this
// doesn't need updating every time the stripe package bumps its type defs.
export const stripe = key ? new Stripe(key) : (null as unknown as Stripe);

export function isStripeConfigured(): boolean {
  return Boolean(key);
}

/**
 * Creates a PaymentIntent with manual capture — the "binding payment" from
 * Section 5. connectedAccountId is optional: the peer marketplace (orders)
 * always passes one so the eventual capture transfers straight to the
 * seller's Connect account, but a Flipsta-sourced shop_items sale (26 Aug
 * 2026) has no connected seller at all — Flipsta itself is the seller, and
 * the fulfiller who ships it is paid separately via a wallet_transactions
 * credit (see /api/shop-items/[id]/confirm-delivery), not a Stripe
 * transfer. Omitting connectedAccountId simply leaves the captured funds on
 * Flipsta's own Stripe balance instead of routing them onward.
 */
export async function createEscrowPaymentIntent(params: {
  amountGBP: number;
  connectedAccountId?: string;
  buyerStripeCustomerId?: string;
  metadata: Record<string, string>;
}) {
  if (!isStripeConfigured()) {
    // Dev/demo fallback — lets the checkout flow be exercised end to end
    // without live Stripe keys. Replace by removing STRIPE_SECRET_KEY check
    // once real keys are set (see INFRASTRUCTURE_TODO.md).
    return { id: `pi_stub_${crypto.randomUUID()}`, client_secret: "stub", status: "requires_capture" };
  }

  return stripe.paymentIntents.create({
    amount: Math.round(params.amountGBP * 100),
    currency: "gbp",
    capture_method: "manual",
    transfer_data: params.connectedAccountId ? { destination: params.connectedAccountId } : undefined,
    customer: params.buyerStripeCustomerId,
    metadata: params.metadata,
  });
}

/** Called once delivery is confirmed (or the extended hold period elapses). */
export async function releaseEscrowFunds(paymentIntentId: string) {
  if (!isStripeConfigured() || paymentIntentId.startsWith("pi_stub_")) {
    return { id: paymentIntentId, status: "succeeded_stub" };
  }
  return stripe.paymentIntents.capture(paymentIntentId);
}

/**
 * Self-serve subscription tier upgrades (Section 7) — separate from the
 * Connect/escrow flow above, which is buyer-seller marketplace money, not
 * platform revenue. Each paid tier (standard/pro/elite) needs its own
 * recurring Stripe Price created in the dashboard; the Price ID is supplied
 * via env var rather than hardcoded, since the exact price point is a
 * business decision made in Stripe, not in code — see INFRASTRUCTURE_TODO.md.
 */
const TIER_PRICE_ENV: Record<"standard" | "pro" | "elite", string | undefined> = {
  standard: process.env.STRIPE_PRICE_STANDARD,
  pro: process.env.STRIPE_PRICE_PRO,
  elite: process.env.STRIPE_PRICE_ELITE,
};

export function isTierBillingConfigured(tier: "standard" | "pro" | "elite"): boolean {
  return isStripeConfigured() && Boolean(TIER_PRICE_ENV[tier]);
}

/** Redirects the user to Stripe Checkout in subscription mode for the chosen tier. */
export async function createTierCheckoutSession(params: {
  tier: "standard" | "pro" | "elite";
  profileId: string;
  email: string;
  existingStripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = TIER_PRICE_ENV[params.tier];
  if (!isStripeConfigured() || !priceId) {
    throw new Error(
      `Billing for the ${params.tier} tier isn't configured yet — set STRIPE_SECRET_KEY and STRIPE_PRICE_${params.tier.toUpperCase()} on Render (see INFRASTRUCTURE_TODO.md). An admin can set your tier manually at /admin/sellers in the meantime.`,
    );
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: params.existingStripeCustomerId ?? undefined,
    customer_email: params.existingStripeCustomerId ? undefined : params.email,
    client_reference_id: params.profileId,
    metadata: { profile_id: params.profileId, tier: params.tier },
    subscription_data: { metadata: { profile_id: params.profileId, tier: params.tier } },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/** Lets an existing subscriber manage or cancel their plan, or change tier, via Stripe's hosted portal. */
export async function createBillingPortalSession(params: { stripeCustomerId: string; returnUrl: string }) {
  if (!isStripeConfigured()) {
    throw new Error("Billing isn't configured yet — set STRIPE_SECRET_KEY on Render (see INFRASTRUCTURE_TODO.md).");
  }
  return stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
}
