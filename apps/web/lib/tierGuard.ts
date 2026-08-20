import { SubscriptionTier } from "@flipsta/shared";

/**
 * Central entitlement map so a tier's rules live in exactly one place —
 * every API route imports this instead of re-deriving "is this Pro?" logic.
 * Mirrors the table in Section 7 of the business doc.
 */
export const TIER_ENTITLEMENTS: Record<
  SubscriptionTier,
  {
    canBid: boolean;
    canSell: boolean;
    sniperMode: boolean;
    earlyAccessSeconds: number; // 0 = none
    syndicateLeadership: boolean;
    aiExplainability: boolean;
    multiPlatformListing: boolean;
  }
> = {
  free: {
    canBid: false,
    canSell: false,
    sniperMode: false,
    earlyAccessSeconds: 0,
    syndicateLeadership: false,
    aiExplainability: false,
    multiPlatformListing: false,
  },
  standard: {
    canBid: true,
    canSell: true,
    sniperMode: false,
    earlyAccessSeconds: 0,
    syndicateLeadership: false,
    aiExplainability: false,
    multiPlatformListing: false,
  },
  pro: {
    canBid: true,
    canSell: true,
    sniperMode: true,
    earlyAccessSeconds: 7 * 60, // 5-10 min band, midpoint
    syndicateLeadership: false,
    aiExplainability: true,
    multiPlatformListing: true,
  },
  elite: {
    canBid: true,
    canSell: true,
    sniperMode: true,
    earlyAccessSeconds: 7 * 60,
    syndicateLeadership: true,
    aiExplainability: true,
    multiPlatformListing: true,
  },
};

export function requireTier(tier: SubscriptionTier, capability: keyof (typeof TIER_ENTITLEMENTS)["free"]) {
  const allowed = TIER_ENTITLEMENTS[tier][capability];
  if (!allowed) {
    throw new TierGuardError(`This action requires a higher subscription tier (current: ${tier}).`);
  }
}

export class TierGuardError extends Error {}
