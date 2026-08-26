import {
  SHOP_ITEM_ESTIMATED_SHIPPING_GBP,
  SHOP_ITEM_FULFILLMENT_CLAIM_WINDOW_HOURS,
  SHOP_ITEM_FULFILLMENT_REWARD_GBP,
  SHOP_ITEM_MAX_CONCURRENT_CLAIMS_PER_USER,
  SHOP_ITEM_MIN_DISCOUNT_VS_RRP_PCT,
  SHOP_ITEM_MIN_OFFER_ACCEPT_PCT_OF_OUR_PRICE,
  SHOP_ITEM_PAYMENT_PROCESSING_RATE,
  SHOP_ITEM_PLATFORM_MARGIN_GBP,
} from "./constants.js";

/**
 * AI-sourced shop items (26 Aug 2026). See migration 0013 for the table
 * this backs and constants.ts for the tunables. A candidate reaching this
 * module already has a genuine retailer discount but failed the
 * independent-resale-evidence check claudeSearchAdapter.ts requires for a
 * reseller opportunity — the only trustworthy price signal left is the
 * retailer's own RRP, so everything here is anchored on that instead of an
 * estimated resale price.
 */
export interface ShopPricingInput {
  /** What it actually costs to go buy the item at the retailer. */
  sourcePriceGBP: number;
  /** The retailer's own listed RRP for the item. */
  rrpGBP: number;
}

export interface ShopPricing {
  /** The Buy Now price shown to customers. */
  ourPriceGBP: number;
  /** Make an Offer auto-accepts at or above this. */
  minOfferAcceptGBP: number;
  /** What the fulfiller earns on top of being reimbursed their outlay. */
  fulfillmentRewardGBP: number;
  /** What the fulfiller is reimbursed for actually buying + shipping the item. */
  fulfillerReimbursementGBP: number;
}

/**
 * Steven: "the website is to work out the offer and after taking into
 * consideration all the fees for buying and shipping etc [decide whether to
 * accept]." ourPriceGBP has to cover, in order: what it actually costs to
 * buy + ship the item (the fulfiller's reimbursement), the flat reward that
 * makes fulfilling worth a Pro/Elite member's time, Stripe's cut of the
 * sale itself, and a small platform margin — grossed up so that after
 * payment processing takes its cut, what's left still covers everything
 * else.
 */
export function computeShopPricing(input: ShopPricingInput): ShopPricing {
  if (input.sourcePriceGBP <= 0) throw new Error("sourcePriceGBP must be positive");
  if (input.rrpGBP <= 0) throw new Error("rrpGBP must be positive");

  const fulfillerReimbursementGBP = round2(input.sourcePriceGBP + SHOP_ITEM_ESTIMATED_SHIPPING_GBP);
  const costFloor = fulfillerReimbursementGBP + SHOP_ITEM_FULFILLMENT_REWARD_GBP + SHOP_ITEM_PLATFORM_MARGIN_GBP;
  const ourPriceGBP = round2(costFloor / (1 - SHOP_ITEM_PAYMENT_PROCESSING_RATE));

  return {
    ourPriceGBP,
    minOfferAcceptGBP: round2(ourPriceGBP * SHOP_ITEM_MIN_OFFER_ACCEPT_PCT_OF_OUR_PRICE),
    fulfillmentRewardGBP: SHOP_ITEM_FULFILLMENT_REWARD_GBP,
    fulfillerReimbursementGBP,
  };
}

/**
 * Only list a candidate on the shop if, after covering reimbursement +
 * reward + fees + margin, the customer still gets a genuine discount vs the
 * retailer's own RRP — otherwise there's nothing to offer over the customer
 * just buying it themselves. This is the same lesson as the 26 Aug 2026
 * Currys-laptop false positive on the reseller-opportunity side (see
 * claudeSearchAdapter.ts's "REAL FAILURE CASE" note): a price only counts
 * as a deal once it's actually checked against what it's being compared to.
 */
export function qualifiesForShop(input: ShopPricingInput): boolean {
  if (input.sourcePriceGBP <= 0 || input.rrpGBP <= 0) return false;
  const { ourPriceGBP } = computeShopPricing(input);
  if (ourPriceGBP >= input.rrpGBP) return false;
  const discountPct = (input.rrpGBP - ourPriceGBP) / input.rrpGBP;
  return discountPct >= SHOP_ITEM_MIN_DISCOUNT_VS_RRP_PCT;
}

/**
 * Make an Offer auto-accept — Steven: "auto accept the offer." All the fee
 * accounting already lives in minOfferAcceptGBP via computeShopPricing, so
 * this is a plain threshold check kept separate so the API route has a
 * single place to get a human-readable accept/reject reason from.
 */
export function evaluateOffer(pricing: ShopPricing, offerGBP: number): { accepted: boolean; reason?: string } {
  if (offerGBP <= 0) return { accepted: false, reason: "Offer must be a positive amount." };
  if (offerGBP >= pricing.minOfferAcceptGBP) return { accepted: true };
  return {
    accepted: false,
    reason: `Offer of £${offerGBP.toFixed(2)} is below the minimum we can accept (£${pricing.minOfferAcceptGBP.toFixed(2)}).`,
  };
}

/**
 * Fairness (Steven: "make sure this is fair so one person isnt bashing all
 * the orders as they come in. maybe put a time delay or limit or
 * something"). Two mechanisms, both enforced by the API route rather than
 * RLS (migration 0013's policies can't easily count a user's other rows):
 * a hard cap on concurrently-claimed jobs, and a claim deadline that
 * auto-releases an abandoned job back to the pool (see the planned worker
 * job releaseExpiredFulfillmentClaims.ts).
 */
export function canClaimAnotherFulfillmentJob(currentActiveClaims: number): boolean {
  return currentActiveClaims < SHOP_ITEM_MAX_CONCURRENT_CLAIMS_PER_USER;
}

export function fulfillmentClaimDeadline(claimedAt: Date): Date {
  return new Date(claimedAt.getTime() + SHOP_ITEM_FULFILLMENT_CLAIM_WINDOW_HOURS * 60 * 60 * 1000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
