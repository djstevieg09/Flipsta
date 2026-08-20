/**
 * Section 2 step 1 (Discovery) — a pluggable interface so real sources
 * (Keepa, retailer affiliate feeds, eBay's API) can be swapped in later
 * without touching the discovery job itself. See keepaAdapter.ts for the
 * stub to fill in once an API key is available (INFRASTRUCTURE_TODO.md).
 */
export interface CandidateDeal {
  categorySlug: string;
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
  findCandidates(): Promise<CandidateDeal[]>;
}
