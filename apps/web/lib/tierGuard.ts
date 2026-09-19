import { SubscriptionTier } from "@flipsta/shared";

/**
 * Central entitlement map so a tier's rules live in exactly one place —
 * every API route imports this instead of re-deriving "is this Pro?" logic.
 * Mirrors the table in Section 7 of the business doc.
 *
 * 19 Sept 2026, Steven: "ok so free is now bronze, only if they have coins
 * can they bid on oppotunities... there is no demo mode or practice mode so
 * remove that." Bronze/free's `canBid` flips to true here — the real gate
 * on a fixed-price deal (see api/opportunities/[id]/buy-slot/route.ts,
 * buy_deal_slot() in migration 0034/0035) is already the caller's actual
 * Flippy Coin balance, atomically checked and debited inside the RPC — a
 * Bronze account with 0 coins already gets a clean 402 "Not enough Flippy
 * Coins" from that route today, same as any other tier would. `canBid` was
 * only ever a categorical block on TOP of that; removing it for free is
 * exactly "only if they have coins can they bid", nothing more. (The two
 * legacy, pre-18-Sept 'auction' routes — bid/instant-win — use the same
 * flag, but per Steven's 18 Sept "moving away from bidding" call those
 * aren't real charged payments yet either — see their own file comments —
 * so opening them too carries no real financial risk.)
 */
export const TIER_ENTITLEMENTS: Record<
  SubscriptionTier,
  {
    canBid: boolean;
    canSell: boolean;
    sniperMode: boolean;
    /**
     * 19 Sept 2026, Steven: "platinum get the first 15 minutes on all
     * oppotnites first, then gold and platinum get the next 15 minutes and
     * then paltinum, gold, and silver the next 15 then everybody." A
     * cascade, not a single Pro/Elite-vs-everyone-else gate: minutes after
     * an opportunity's created_at before THIS tier can act on it.
     * Platinum(elite)=0 (sees it first), Gold(pro)=15, Silver(standard)=30,
     * Bronze(free)=45 (i.e. "everybody"). See earlyAccessRevealsAt() below —
     * every reveal time is computed from this one table, nothing is stored
     * per-opportunity (the old pro_early_access_until column, migration
     * 0001, was never actually written by any code — a real, silent gap:
     * early access has had zero effect for any tier up to now).
     */
    earlyAccessDelayMinutes: number;
    syndicateLeadership: boolean;
    aiExplainability: boolean;
    multiPlatformListing: boolean;
    /** 26 Aug 2026, Steven: "the order is then passed onto the pro and
     * elite opptunites as a free button to press to fulfill the order" —
     * whether this tier can claim a shop_items fulfillment job. See
     * apps/web/app/api/fulfillment/route.ts and migration 0013. */
    canFulfill: boolean;
  }
> = {
  free: {
    canBid: true,
    canSell: false,
    sniperMode: false,
    earlyAccessDelayMinutes: 45,
    syndicateLeadership: false,
    aiExplainability: false,
    multiPlatformListing: false,
    canFulfill: false,
  },
  standard: {
    canBid: true,
    canSell: true,
    sniperMode: false,
    earlyAccessDelayMinutes: 30,
    syndicateLeadership: false,
    aiExplainability: false,
    multiPlatformListing: false,
    canFulfill: false,
  },
  pro: {
    canBid: true,
    canSell: true,
    sniperMode: true,
    earlyAccessDelayMinutes: 15,
    syndicateLeadership: false,
    aiExplainability: true,
    multiPlatformListing: true,
    canFulfill: true,
  },
  elite: {
    canBid: true,
    canSell: true,
    sniperMode: true,
    earlyAccessDelayMinutes: 0,
    syndicateLeadership: true,
    aiExplainability: true,
    multiPlatformListing: true,
    canFulfill: true,
  },
};

export function requireTier(tier: SubscriptionTier, capability: keyof (typeof TIER_ENTITLEMENTS)["free"]) {
  const allowed = TIER_ENTITLEMENTS[tier][capability];
  if (!allowed) {
    throw new TierGuardError(`This action requires a higher subscription tier (current: ${tier}).`);
  }
}

/** The moment an opportunity created at `createdAt` becomes visible/actionable for `tier`. */
export function earlyAccessRevealsAt(tier: SubscriptionTier, createdAt: string | Date): Date {
  const delayMs = TIER_ENTITLEMENTS[tier].earlyAccessDelayMinutes * 60_000;
  return new Date(new Date(createdAt).getTime() + delayMs);
}

/** Whether `tier` is still waiting out its early-access delay on an opportunity created at `createdAt`. */
export function isEarlyAccessLocked(tier: SubscriptionTier, createdAt: string | Date): boolean {
  return earlyAccessRevealsAt(tier, createdAt).getTime() > Date.now();
}

export class TierGuardError extends Error {}
