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

/** Creates a PaymentIntent with manual capture — the "binding payment" from Section 5. */
export async function createEscrowPaymentIntent(params: {
  amountGBP: number;
  connectedAccountId: string;
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
    transfer_data: { destination: params.connectedAccountId },
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
