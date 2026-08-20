import { describe, expect, it } from "vitest";
import { isValidSalesChannel, publishListingToChannel, suggestListingFromOpportunity } from "./salesChannels.js";

describe("isValidSalesChannel", () => {
  it("accepts known channels", () => {
    expect(isValidSalesChannel("ebay")).toBe(true);
    expect(isValidSalesChannel("depop")).toBe(true);
  });

  it("rejects unknown channels", () => {
    expect(isValidSalesChannel("gumtree")).toBe(false);
  });
});

describe("publishListingToChannel (stub)", () => {
  it("simulates a successful publish with an external URL", async () => {
    const result = await publishListingToChannel("vinted", { id: "abc123", title: "Test item", priceGBP: 20 });
    expect(result.success).toBe(true);
    expect(result.channel).toBe("vinted");
    expect(result.externalUrl).toContain("abc123");
  });
});

describe("suggestListingFromOpportunity (Section 12.1 AI pre-fill)", () => {
  it("suggests a title from category and source tier, and a price of cost + full margin", () => {
    const suggestion = suggestListingFromOpportunity({
      categoryName: "Collectibles",
      sourceTier: "Major UK high-street clearance",
      sourcePriceGBP: 53.99,
      expectedMarginGBP: 24.01,
    });
    expect(suggestion.suggestedTitle).toBe("Collectibles — Major UK high-street clearance");
    expect(suggestion.suggestedPriceGBP).toBe(78);
  });
});
