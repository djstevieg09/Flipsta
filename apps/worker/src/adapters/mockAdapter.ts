import { SourceAdapter, CandidateDeal, DiscoveryResult } from "./sourceAdapter.js";

/**
 * Demo adapter so the discovery pipeline is exercisable end to end without
 * any paid data source configured yet. Produces plausible candidates in the
 * same shape a real adapter would. Swap for keepaAdapter.ts (or a real
 * retailer feed) once INFRASTRUCTURE_TODO.md's data-source steps are done.
 */
const SAMPLE_POOL: Omit<CandidateDeal, "sourcePriceGBP" | "estimatedResalePriceGBP">[] = [
  {
    categorySlug: "collectibles",
    productName: "Sample Collectible Figure",
    imageUrl: null,
    sourceTier: "Independent retailer clearance",
    sourceRetailer: "Sample Retailer Ltd",
    sourceUrl: "https://example.com/sample-collectible",
    estimatedStockUnits: 15,
    perCustomerCap: 3,
    priceVolatility: 0.6,
    seasonalEventName: null,
  },
  {
    categorySlug: "tech",
    productName: "Sample Bluetooth Speaker",
    imageUrl: null,
    sourceTier: "Major online marketplace overstock",
    sourceRetailer: "Sample Marketplace",
    sourceUrl: "https://example.com/sample-tech",
    estimatedStockUnits: 80,
    perCustomerCap: null,
    priceVolatility: 0.1,
    seasonalEventName: null,
  },
  {
    categorySlug: "footwear",
    productName: "Sample Running Trainers",
    imageUrl: null,
    sourceTier: "Independent retailer clearance",
    sourceRetailer: "Sample Sneaker Store",
    sourceUrl: "https://example.com/sample-footwear",
    estimatedStockUnits: 12,
    perCustomerCap: 2,
    priceVolatility: 0.4,
    seasonalEventName: null,
  },
];

export const mockAdapter: SourceAdapter = {
  name: "mock",
  // Ignores onBatch — it's a single-shot demo adapter with nothing to
  // batch across, so the caller's own final catch-all pass over whatever
  // this returns handles it (see discoverOpportunities.ts). No sample shop
  // candidates yet — the mock pool only demos the reseller-opportunity
  // path; shopCandidates stays empty until there's a reason to demo that
  // path without a real ANTHROPIC_API_KEY too.
  async findCandidates(): Promise<DiscoveryResult> {
    const deals: CandidateDeal[] = SAMPLE_POOL.map((base) => {
      const sourcePriceGBP = round2(10 + Math.random() * 80);
      const marginMultiplier = 1.15 + Math.random() * 0.25; // 15-40% uplift
      return {
        ...base,
        sourcePriceGBP,
        estimatedResalePriceGBP: round2(sourcePriceGBP * marginMultiplier),
      };
    });
    return { deals, shopCandidates: [] };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
