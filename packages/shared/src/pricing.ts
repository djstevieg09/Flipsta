import {
  ACTION_CLOCK_SECONDS,
  BUYBACK_FINAL_AT_COST_WINDOW_HOURS,
  BUYBACK_PAYOUT_PCT,
  BUYBACK_PROOF_OF_LISTING_DAYS,
  BUYBACK_TARGET_LOSS_RATIO,
  BUYBACK_TIER_DISCOUNT,
  INSTANT_WIN_PCT_OF_MARGIN,
  MARKETPLACE_COMMISSION_RATE,
  STARTING_BID_PCT_OF_MARGIN,
  SubscriptionTier,
  UrgencyTier,
} from "./constants.js";

/** Section 11.1 — urgency tier drives the action clock length. */
export interface UrgencyInput {
  /** True if the source has a hard per-customer or limited-stock cap. */
  limitedStock: boolean;
  /** Estimated units the destination resale market can absorb without price collapse. */
  estimatedMarketDepth: number;
  /** 0-1, how much the source price has moved recently. Higher = more volatile. */
  priceVolatility: number;
}

export function classifyUrgencyTier(input: UrgencyInput): UrgencyTier {
  if (input.limitedStock && input.priceVolatility >= 0.5) return "hot";
  if (input.estimatedMarketDepth >= 50 && input.priceVolatility < 0.2) return "stable";
  return "standard";
}

export function actionClockSeconds(tier: UrgencyTier): number {
  const { min, max } = ACTION_CLOCK_SECONDS[tier];
  // Deterministic midpoint rather than random, so the same opportunity
  // always gets the same clock length when recomputed.
  return Math.round((min + max) / 2);
}

/**
 * Section 11.3 — Starting Bid & Instant-Win Pricing.
 * Both are priced off expected MARGIN, not sale price, because the bidder
 * is buying the right to capture the margin, not the item itself.
 */
export function calculateStartingBid(expectedMarginGBP: number, confidenceScore: number): number {
  if (expectedMarginGBP <= 0) throw new Error("expectedMarginGBP must be positive");
  const clamped = clamp01(confidenceScore);
  const pct =
    STARTING_BID_PCT_OF_MARGIN.min +
    (STARTING_BID_PCT_OF_MARGIN.max - STARTING_BID_PCT_OF_MARGIN.min) * clamped;
  return round2(expectedMarginGBP * pct);
}

export function calculateInstantWinPrice(expectedMarginGBP: number, confidenceScore: number): number {
  if (expectedMarginGBP <= 0) throw new Error("expectedMarginGBP must be positive");
  const clamped = clamp01(confidenceScore);
  const pct =
    INSTANT_WIN_PCT_OF_MARGIN.min +
    (INSTANT_WIN_PCT_OF_MARGIN.max - INSTANT_WIN_PCT_OF_MARGIN.min) * clamped;
  return round2(expectedMarginGBP * pct);
}

/**
 * Section 8.3 — Buyback Guarantee, per-purchase insurance pricing formula:
 *   premium = (P_fail * payoutPct * itemPrice) / targetLossRatio
 * Pro/Elite get a discount on the resulting premium (Section 7).
 */
export function calculateBuybackPremium(
  itemPriceGBP: number,
  failureProbability: number,
  tier: SubscriptionTier,
  payoutPct: number = BUYBACK_PAYOUT_PCT,
  targetLossRatio: number = BUYBACK_TARGET_LOSS_RATIO,
): number {
  if (itemPriceGBP <= 0) throw new Error("itemPriceGBP must be positive");
  const pFail = clamp01(failureProbability);
  const base = (pFail * payoutPct * itemPriceGBP) / targetLossRatio;
  const discount = BUYBACK_TIER_DISCOUNT[tier] ?? 0;
  return round2(base * (1 - discount));
}

/** Section 11.6 — a buyback claim is only payable after this much genuine sale effort. */
export function isBuybackClaimEligible(params: {
  listedAt: Date;
  now: Date;
  listedAtOrBelowEstimate: boolean;
  offeredAtCostAfterWindow: boolean;
}): { eligible: boolean; reason?: string } {
  const daysListed = (params.now.getTime() - params.listedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (!params.listedAtOrBelowEstimate) {
    return { eligible: false, reason: "Item was never listed at or below the AI's estimated resale price." };
  }
  if (daysListed < BUYBACK_PROOF_OF_LISTING_DAYS) {
    return {
      eligible: false,
      reason: `Proof-of-listing window not yet complete (${daysListed.toFixed(1)}/${BUYBACK_PROOF_OF_LISTING_DAYS} days).`,
    };
  }
  if (!params.offeredAtCostAfterWindow) {
    return {
      eligible: false,
      reason: `Item must be offered at cost for ${BUYBACK_FINAL_AT_COST_WINDOW_HOURS}h before a claim is payable.`,
    };
  }
  return { eligible: true };
}

/** Section 8.1 — Marketplace Commission, tiered by subscription. */
export function getMarketplaceCommissionRate(tier: SubscriptionTier): number {
  return MARKETPLACE_COMMISSION_RATE[tier];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
