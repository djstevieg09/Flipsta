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
  /**
   * 19 Sept 2026, Steven: "also setup the commision as we will get this for
   * marketplace purchases etc." Stripe Connect's own mechanism for a
   * platform to actually keep its cut of a destination-charge transfer —
   * without this, the FULL amountGBP was flowing to connectedAccountId and
   * Flipsta kept nothing, even though orderCreation.ts was already
   * computing and storing commission_gbp on the order row the whole time
   * (a real, silent gap: the number was recorded for bookkeeping but never
   * actually collected). Only meaningful together with connectedAccountId —
   * ignored otherwise.
   */
  applicationFeeGBP?: number;
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
    application_fee_amount:
      params.connectedAccountId && params.applicationFeeGBP ? Math.round(params.applicationFeeGBP * 100) : undefined,
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
    // 19 Sept 2026 — kind: "tier_upgrade" lets the webhook's
    // checkout.session.completed handler tell this apart from a coin/merch/
    // dropship purchase using the same event type (see webhooks/stripe/route.ts).
    metadata: { kind: "tier_upgrade", profile_id: params.profileId, tier: params.tier },
    subscription_data: { metadata: { kind: "tier_upgrade", profile_id: params.profileId, tier: params.tier } },
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

/**
 * 18 Sept 2026, Steven: "get the flippy coins shop all working." A one-off
 * payment (not a subscription) for a Flippy Coin bundle — priceGBP/coins
 * come from COIN_BUNDLES (packages/shared/src/constants.ts) by bundle id,
 * looked up server-side in the route that calls this, never trusted from
 * the client. Uses an inline `price_data` line item rather than a
 * pre-created Stripe Price (unlike createTierCheckoutSession's
 * subscriptions) since there's no dashboard setup needed for a one-off
 * amount — this works the moment STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET
 * are set. metadata.kind = "coin_purchase" is how the webhook (see
 * app/api/webhooks/stripe/route.ts) tells this apart from any other
 * checkout.session.completed event.
 */
export async function createCoinCheckoutSession(params: {
  bundleId: string;
  coins: number;
  bundleName: string;
  priceGBP: number;
  profileId: string;
  email: string;
  existingStripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!isStripeConfigured()) {
    throw new Error("Buying Flippy Coins isn't set up yet — set STRIPE_SECRET_KEY on Render (see INFRASTRUCTURE_TODO.md).");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: { name: `${params.bundleName} — ${params.coins} Flippy Coin${params.coins === 1 ? "" : "s"}` },
          unit_amount: Math.round(params.priceGBP * 100),
        },
        quantity: 1,
      },
    ],
    customer: params.existingStripeCustomerId ?? undefined,
    customer_email: params.existingStripeCustomerId ? undefined : params.email,
    client_reference_id: params.profileId,
    metadata: { kind: "coin_purchase", profile_id: params.profileId, bundle_id: params.bundleId, coins: String(params.coins) },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/**
 * 18 Sept 2026, Steven: "need to add a merch tab... with tshirts, caps and
 * other items that people can buy." Another one-off "payment"-mode
 * Checkout Session, same shape as createCoinCheckoutSession above, plus
 * `shipping_address_collection` and a flat `shipping_options` rate since
 * this is a physical item Stripe needs a delivery address for — Flipsta
 * doesn't have its own address form to build/validate, so Stripe's own
 * hosted one collects it. The address Stripe collects comes back on the
 * completed session (`shipping_details`) for the webhook to save onto
 * merch_orders (migration 0032). metadata.kind = "merch_purchase"
 * distinguishes this from a coin purchase in the same webhook handler.
 */
export async function createMerchCheckoutSession(params: {
  itemId: string;
  itemName: string;
  size?: string;
  quantity: number;
  priceGBP: number;
  shippingGBP: number;
  profileId: string;
  email: string;
  existingStripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!isStripeConfigured()) {
    throw new Error("Buying merch isn't set up yet — set STRIPE_SECRET_KEY on Render (see INFRASTRUCTURE_TODO.md).");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: { name: params.size ? `${params.itemName} (${params.size})` : params.itemName },
          unit_amount: Math.round(params.priceGBP * 100),
        },
        quantity: params.quantity,
      },
    ],
    shipping_address_collection: { allowed_countries: ["GB"] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(params.shippingGBP * 100), currency: "gbp" },
          display_name: "UK Standard Shipping",
        },
      },
    ],
    customer: params.existingStripeCustomerId ?? undefined,
    customer_email: params.existingStripeCustomerId ? undefined : params.email,
    client_reference_id: params.profileId,
    metadata: {
      kind: "merch_purchase",
      profile_id: params.profileId,
      item_id: params.itemId,
      item_name: params.itemName,
      size: params.size ?? "",
      quantity: String(params.quantity),
      price_gbp: String(params.priceGBP),
      shipping_gbp: String(params.shippingGBP),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/**
 * 18 Sept 2026, Steven: "add ali express products and add them into our
 * shop with a 25% markup and when someone orders it then a dropship order
 * is created." Same shape as createMerchCheckoutSession just above — a
 * one-off "payment"-mode Checkout Session with Stripe's own hosted
 * shipping-address collection, since staff need a real address to place
 * the matching order on AliExpress. metadata.kind = "dropship_purchase"
 * distinguishes this in the webhook handler; metadata.dropship_product_id
 * is what lets the webhook snapshot the product into dropship_orders
 * (migration 0033) without a second lookup.
 */
export async function createDropshipCheckoutSession(params: {
  dropshipProductId: string;
  productTitle: string;
  productImageUrl?: string | null;
  quantity: number;
  priceGBP: number;
  shippingGBP: number;
  profileId: string;
  email: string;
  existingStripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!isStripeConfigured()) {
    throw new Error("Buying isn't set up yet — set STRIPE_SECRET_KEY on Render (see INFRASTRUCTURE_TODO.md).");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: params.productTitle,
            images: params.productImageUrl ? [params.productImageUrl] : undefined,
          },
          unit_amount: Math.round(params.priceGBP * 100),
        },
        quantity: params.quantity,
      },
    ],
    shipping_address_collection: { allowed_countries: ["GB"] },
    shipping_options:
      params.shippingGBP > 0
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: Math.round(params.shippingGBP * 100), currency: "gbp" },
                display_name: "UK Standard Shipping",
              },
            },
          ]
        : undefined,
    customer: params.existingStripeCustomerId ?? undefined,
    customer_email: params.existingStripeCustomerId ? undefined : params.email,
    client_reference_id: params.profileId,
    metadata: {
      kind: "dropship_purchase",
      profile_id: params.profileId,
      dropship_product_id: params.dropshipProductId,
      product_title: params.productTitle,
      product_image_url: params.productImageUrl ?? "",
      quantity: String(params.quantity),
      price_gbp: String(params.priceGBP),
      shipping_gbp: String(params.shippingGBP),
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/**
 * 26 Aug 2026, Steven: "Need an accounts page so people can setup their
 * payment methods." Until now a stripe_customer_id only ever got created
 * as a side effect of subscribing to a paid tier (createTierCheckoutSession
 * above) — so createBillingPortalSession's "No billing account on file yet"
 * error (see POST /api/billing/portal) blocked a free-tier buyer from ever
 * saving a card at all, even though they can already buy shop items and
 * marketplace listings without subscribing to anything.
 *
 * This creates a bare Stripe Customer (no subscription attached) the first
 * time someone visits their account page, so EVERY signed-in user — not
 * just paid subscribers — has somewhere for the Billing Portal to manage a
 * saved payment method. Never touches card details directly: the portal is
 * Stripe's own hosted page, so no card number ever reaches Flipsta's
 * server or database (the same PCI-safe boundary createEscrowPaymentIntent
 * and Checkout already rely on).
 */
export async function getOrCreateStripeCustomer(params: {
  existingStripeCustomerId?: string | null;
  email: string;
  profileId: string;
}): Promise<string> {
  if (!isStripeConfigured()) {
    throw new Error("Billing isn't configured yet — set STRIPE_SECRET_KEY on Render (see INFRASTRUCTURE_TODO.md).");
  }
  if (params.existingStripeCustomerId) return params.existingStripeCustomerId;

  const customer = await stripe.customers.create({
    email: params.email,
    metadata: { profile_id: params.profileId },
  });
  return customer.id;
}
