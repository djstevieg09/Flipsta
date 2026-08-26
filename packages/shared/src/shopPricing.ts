import {
  SHOP_ITEM_ESTIMATED_SHIPPING_GBP,
  SHOP_ITEM_FULFILLMENT_CLAIM_WINDOW_HOURS,
  SHOP_ITEM_FULFILLMENT_REWARD_MIN_GBP,
  SHOP_ITEM_FULFILLMENT_REWARD_PCT,
  SHOP_ITEM_MAX_CONCURRENT_CLAIMS_PER_USER,
  SHOP_ITEM_MIN_DISCOUNT_VS_RRP_PCT,
  SHOP_ITEM_OFFER_WIGGLE_ROOM_PCT,
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
  /** The Buy Now price shown to customers — the break-even floor plus
   * SHOP_ITEM_OFFER_WIGGLE_ROOM_PCT, so there's room to negotiate down via
   * Make an Offer without ever actually selling below cost. */
  ourPriceGBP: number;
  /** Make an Offer auto-accepts at or above this. This IS the break-even
   * floor itself (reimbursement + reward + margin, grossed up for payment
   * processing) — never lower than ourPriceGBP's actual cost basis, per
   * Steven, 26 Aug 2026: "thats rck bottom so if someone makes an offer we
   * cannot go lower." */
  minOfferAcceptGBP: number;
  /** What the fulfiller earns on top of being reimbursed their outlay. */
  fulfillmentRewardGBP: number;
  /** What the fulfiller is reimbursed for actually buying + shipping the item. */
  fulfillerReimbursementGBP: number;
}

/**
 * Steven: "the website is to work out the offer and after taking into
 * consideration all the fees for buying and shipping etc [decide whether to
 * accept]." The break-even floor has to cover, in order: what it actually
 * costs to buy + ship the item (the fulfiller's reimbursement), a reward
 * that scales with that reimbursement — Steven, 26 Aug 2026: "a reward set
 * at percentages. The more expensive the item the better the reward as the
 * reseller is locking up more capital" — and a small platform margin,
 * grossed up so that after payment processing takes its cut, what's left
 * still covers everything else. That floor becomes minOfferAcceptGBP
 * directly (it's already rock bottom — nothing more to subtract).
 * ourPriceGBP, the price customers actually see, is that floor with
 * SHOP_ITEM_OFFER_WIGGLE_ROOM_PCT added on top.
 */
export function computeShopPricing(input: ShopPricingInput): ShopPricing {
  if (input.sourcePriceGBP <= 0) throw new Error("sourcePriceGBP must be positive");
  if (input.rrpGBP <= 0) throw new Error("rrpGBP must be positive");

  const fulfillerReimbursementGBP = round2(input.sourcePriceGBP + SHOP_ITEM_ESTIMATED_SHIPPING_GBP);
  // Percentage of the capital the fulfiller has locked up, not a flat fee —
  // a floor keeps a cheap item's reward from rounding down to something not
  // worth the trip.
  const fulfillmentRewardGBP = Math.max(
    round2(fulfillerReimbursementGBP * SHOP_ITEM_FULFILLMENT_REWARD_PCT),
    SHOP_ITEM_FULFILLMENT_REWARD_MIN_GBP,
  );
  const costFloor = fulfillerReimbursementGBP + fulfillmentRewardGBP + SHOP_ITEM_PLATFORM_MARGIN_GBP;
  // The true rock-bottom: after Stripe takes its cut of whatever price is
  // actually paid, what's left must still cover costFloor. Since the fee is
  // a percentage, this floor holds regardless of whether the sale ends up
  // at ourPriceGBP or a lower accepted offer — grossing up once here is
  // enough, no separate grossing-up needed at offer-acceptance time.
  const breakEvenGBP = round2(costFloor / (1 - SHOP_ITEM_PAYMENT_PROCESSING_RATE));
  const ourPriceGBP = round2(breakEvenGBP * (1 + SHOP_ITEM_OFFER_WIGGLE_ROOM_PCT));

  return {
    ourPriceGBP,
    minOfferAcceptGBP: breakEvenGBP,
    fulfillmentRewardGBP,
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
 * Make an Offer auto-accept logic — Steven originally asked for this
 * ("auto accept the offer"), then asked to remove the customer-facing
 * button (26 Aug 2026: "Also take away the offer button"), so nothing in
 * apps/web currently calls this. Left in place, tested, since the pricing
 * math (minOfferAcceptGBP as the true rock-bottom floor) is still correct
 * and cheap to keep around if Make an Offer comes back later.
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
