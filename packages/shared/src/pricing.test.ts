import { describe, expect, it } from "vitest";
import {
  calculateBuybackPremium,
  calculateInstantWinPrice,
  calculateStartingBid,
  classifyUrgencyTier,
  actionClockSeconds,
  getMarketplaceCommissionRate,
  isBuybackClaimEligible,
} from "./pricing.js";

describe("classifyUrgencyTier + actionClockSeconds (Section 11.1)", () => {
  it("classifies limited, volatile stock as hot with a short clock", () => {
    const tier = classifyUrgencyTier({ limitedStock: true, estimatedMarketDepth: 40, priceVolatility: 0.8 });
    expect(tier).toBe("hot");
    expect(actionClockSeconds(tier)).toBe(25 * 60);
  });

  it("classifies deep, stable stock as stable with a 60 minute clock", () => {
    const tier = classifyUrgencyTier({ limitedStock: false, estimatedMarketDepth: 80, priceVolatility: 0.05 });
    expect(tier).toBe("stable");
    expect(actionClockSeconds(tier)).toBe(60 * 60);
  });

  it("falls back to standard otherwise", () => {
    const tier = classifyUrgencyTier({ limitedStock: false, estimatedMarketDepth: 20, priceVolatility: 0.3 });
    expect(tier).toBe("standard");
    expect(actionClockSeconds(tier)).toBe(45 * 60);
  });
});

describe("calculateStartingBid / calculateInstantWinPrice (Section 11.3)", () => {
  it("prices off margin, not sale price — higher confidence means a higher starting bid", () => {
    const low = calculateStartingBid(20, 0.2);
    const high = calculateStartingBid(20, 0.95);
    expect(high).toBeGreaterThan(low);
    // Both stay inside the documented 15-20% of margin band.
    expect(low).toBeGreaterThanOrEqual(20 * 0.15 - 0.01);
    expect(high).toBeLessThanOrEqual(20 * 0.2 + 0.01);
  });

  it("instant-win price is always higher than the starting bid for the same opportunity", () => {
    const margin = 40;
    const confidence = 0.85;
    expect(calculateInstantWinPrice(margin, confidence)).toBeGreaterThan(calculateStartingBid(margin, confidence));
  });

  it("rejects non-positive margins", () => {
    expect(() => calculateStartingBid(0, 0.5)).toThrow();
    expect(() => calculateInstantWinPrice(-5, 0.5)).toThrow();
  });
});

describe("calculateBuybackPremium (Section 8.3)", () => {
  it("matches the worked example: £65 item, 8% failure chance, standard tier ≈ £6", () => {
    const premium = calculateBuybackPremium(65, 0.08, "standard");
    expect(premium).toBeGreaterThanOrEqual(5.5);
    expect(premium).toBeLessThanOrEqual(6.5);
  });

  it("matches the worked example: £65 item, 20% failure chance, standard tier ≈ £15", () => {
    const premium = calculateBuybackPremium(65, 0.2, "standard");
    expect(premium).toBeGreaterThanOrEqual(14);
    expect(premium).toBeLessThanOrEqual(16);
  });

  it("applies the Pro/Elite discount on top of the base premium", () => {
    const standard = calculateBuybackPremium(65, 0.2, "standard");
    const elite = calculateBuybackPremium(65, 0.2, "elite");
    expect(elite).toBeLessThan(standard);
    expect(elite).toBeCloseTo(standard * 0.75, 1);
  });
});

describe("isBuybackClaimEligible (Section 11.6 anti-abuse safeguards)", () => {
  const now = new Date("2026-08-20T00:00:00Z");

  it("rejects a claim filed before the 14-day proof-of-listing window", () => {
    const listedAt = new Date("2026-08-15T00:00:00Z"); // 5 days
    const result = isBuybackClaimEligible({ listedAt, now, listedAtOrBelowEstimate: true, offeredAtCostAfterWindow: false });
    expect(result.eligible).toBe(false);
  });

  it("rejects a claim that never offered at cost after the window", () => {
    const listedAt = new Date("2026-08-01T00:00:00Z"); // 19 days
    const result = isBuybackClaimEligible({ listedAt, now, listedAtOrBelowEstimate: true, offeredAtCostAfterWindow: false });
    expect(result.eligible).toBe(false);
  });

  it("accepts a claim that satisfies both the window and the at-cost offer", () => {
    const listedAt = new Date("2026-08-01T00:00:00Z");
    const result = isBuybackClaimEligible({ listedAt, now, listedAtOrBelowEstimate: true, offeredAtCostAfterWindow: true });
    expect(result.eligible).toBe(true);
  });
});

describe("getMarketplaceCommissionRate (Section 8.1)", () => {
  it("matches the documented tiered rates", () => {
    expect(getMarketplaceCommissionRate("standard")).toBe(0.12);
    expect(getMarketplaceCommissionRate("pro")).toBe(0.08);
    expect(getMarketplaceCommissionRate("elite")).toBe(0.05);
  });
});
