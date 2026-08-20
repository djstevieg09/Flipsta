import { describe, expect, it } from "vitest";
import { isAiScoringConfigured, scoreOpportunity } from "./aiScoring.js";

// No ANTHROPIC_API_KEY in the test environment — this exercises the
// fallback path only, same as a fresh clone with nothing configured yet.
describe("scoreOpportunity (no ANTHROPIC_API_KEY set)", () => {
  it("reports AI scoring as not configured", () => {
    expect(isAiScoringConfigured()).toBe(false);
  });

  it("falls back to the heuristic and returns a valid result", async () => {
    const result = await scoreOpportunity({
      categoryName: "Collectibles",
      sourceTier: "Major UK high-street clearance",
      sourceRetailer: "LEGO.com",
      sourcePriceGBP: 53.99,
      estimatedResalePriceGBP: 78,
      marginPct: 0.24,
      priceVolatility: 0.1,
      estimatedStockUnits: 40,
    });
    expect(result.confidenceScore).toBeGreaterThan(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(1);
    expect(result.reasoning).toContain("Heuristic");
  });
});
