/**
 * Section 2 step 1 (Discovery) — a pluggable interface so real sources
 * (Keepa, retailer affiliate feeds, eBay's API) can be swapped in later
 * without touching the discovery job itself. See keepaAdapter.ts for the
 * stub to fill in once an API key is available (INFRASTRUCTURE_TODO.md).
 */
export interface CandidateDeal {
  categorySlug: string;
  /** The specific product's real name, e.g. "Eaglemoss Star Trek Klingon
   * Bird-of-Prey Die-Cast Model" — becomes the listing title once someone
   * wins it (see discoverOpportunities.ts / apps/web/app/sell/new). */
  productName: string;
  /** A real product image URL if one was found, else null — never a
   * placeholder or invented URL. */
  imageUrl: string | null;
  sourceTier: string;
  sourceRetailer: string;
  sourceUrl: string;
  sourcePriceGBP: number;
  estimatedResalePriceGBP: number;
  estimatedStockUnits: number;
  perCustomerCap: number | null;
  priceVolatility: number; // 0-1
}

/**
 * 26 Aug 2026, Steven: "We are missing a big trick here. When the bot does a
 * search and finds an item that has a good margin on it but rejects it as
 * cannot find proof of selling then i want it to capture all of the info
 * including photos and then post the item on our shop." A ShopCandidate is
 * that second, lower-bar outcome of the same search: a genuine retailer
 * discount was found, but nothing independent backs a resale estimate, so
 * it can't become a reseller CandidateDeal — instead it's priced off the
 * retailer's own RRP (see packages/shared/src/shopPricing.ts) and listed
 * directly on Flipsta's own /shop, fulfilled by a Pro/Elite member. See
 * migration 0013 for the shop_items table this becomes.
 */
export interface ShopCandidate {
  categorySlug: string;
  /** The specific product's real name — same bar as CandidateDeal.productName. */
  productName: string;
  /** A short customer-facing description. Null if nothing usable was found
   * on the source page — the API/UI falls back to a generic line rather
   * than inventing detail. */
  description: string | null;
  /** A real product image URL if one was found, else null — never invented. */
  imageUrl: string | null;
  sourceRetailer: string;
  sourceUrl: string;
  sourcePriceGBP: number;
  /** The retailer's own listed RRP — the only price anchor available here,
   * since there's no independent resale evidence for this candidate. */
  rrpGBP: number;
  estimatedStockUnits: number;
}

/** One adapter run's full output — the two different outcomes of the same search. */
export interface DiscoveryBatch {
  deals: CandidateDeal[];
  shopCandidates: ShopCandidate[];
}

export type DiscoveryResult = DiscoveryBatch;

export interface SourceAdapter {
  name: string;
  /**
   * 26 Aug 2026, Steven, filling the dashboard for the first time: "i need
   * it to keep goint to start with until its got 1 oppotunity. then stop
   * once its founfd one and its displayed it on dashboard." "Displayed on
   * the dashboard" means an actual opportunity, past the real margin and
   * AI-confidence checks in discoverOpportunities.ts — not just a
   * candidate the adapter itself thinks looks promising, which is a lower
   * bar. onBatch, when provided, lets the caller (discoverOpportunities.ts)
   * run that real verification on each batch of candidates AS the adapter
   * finds them, and tell the adapter "I've got enough, stop early" (return
   * true) or "keep going" (return false) — so a multi-source adapter like
   * claudeSearchAdapter can stop trying more sources the moment a real
   * opportunity has actually been created, not just reported. Adapters
   * that don't do multi-batch discovery (mockAdapter) can ignore this and
   * just return everything at once — the caller still processes whatever
   * comes back either way.
   *
   * shopCandidates in each batch are NEVER part of the stop-early decision
   * — only deals count toward "found enough opportunities" (Steven's
   * target above is about opportunities specifically). Every genuine shop
   * candidate found gets processed regardless, per Steven: "that way any
   * credit used isnt wasted as a missed oppotunity."
   */
  findCandidates(onBatch?: (batch: DiscoveryBatch) => Promise<boolean>): Promise<DiscoveryResult>;
}
