import { SourceAdapter, CandidateDeal } from "./sourceAdapter.js";

/**
 * Demo adapter so the discovery pipeline is exercisable end to end without
 * any paid data source configured yet. Produces plausible candidates in the
 * same shape a real adapter would. Swap for keepaAdapter.ts (or a real
 * retailer feed) once INFRASTRUCTURE_TODO.md's data-source steps are done.
 */
const SAMPLE_POOL: Omit<CandidateDeal, "sourcePriceGBP" | "estimatedResalePriceGBP">[] = [
  {
    categorySlug: "collectibles",
    sourceTier: "Independent retailer clearance",
    sourceRetailer: "Sample Retailer Ltd",
    sourceUrl: "https://example.com/sample-collectible",
    estimatedStockUnits: 15,
    perCustomerCap: 3,
    priceVolatility: 0.6,
  },
  {
    categorySlug: "tech",
    sourceTier: "Major online marketplace overstock",
    sourceRetailer: "Sample Marketplace",
    sourceUrl: "https://example.com/sample-tech",
    estimatedStockUnits: 80,
    perCustomerCap: null,
    priceVolatility: 0.1,
  },
  {
    categorySlug: "footwear",
    sourceTier: "Independent retailer clearance",
    sourceRetailer: "Sample Sneaker Store",
    sourceUrl: "https://example.com/sample-footwear",
    estimatedStockUnits: 12,
    perCustomerCap: 2,
    priceVolatility: 0.4,
  },
];

export const mockAdapter: SourceAdapter = {
  name: "mock",
  async findCandidates(): Promise<CandidateDeal[]> {
    return SAMPLE_POOL.map((base) => {
      const sourcePriceGBP = round2(10 + Math.random() * 80);
      const marginMultiplier = 1.15 + Math.random() * 0.25; // 15-40% uplift
      return {
        ...base,
        sourcePriceGBP,
        estimatedResalePriceGBP: round2(sourcePriceGBP * marginMultiplier),
      };
    });
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
