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
   */
  findCandidates(onBatch?: (batch: CandidateDeal[]) => Promise<boolean>): Promise<CandidateDeal[]>;
}
