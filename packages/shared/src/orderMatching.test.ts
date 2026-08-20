import { describe, expect, it } from "vitest";
import { sortByPriceTimePriority, rankWantOffers } from "./orderMatching.js";

describe("sortByPriceTimePriority (Section 11.4)", () => {
  it("sorts lowest price first", () => {
    const listings = [
      { id: "a", sellerId: "s1", priceGBP: 81.99, listedAt: new Date("2026-08-17") },
      { id: "b", sellerId: "s2", priceGBP: 74.5, listedAt: new Date("2026-08-18") },
      { id: "c", sellerId: "s3", priceGBP: 76.0, listedAt: new Date("2026-08-16") },
    ];
    const sorted = sortByPriceTimePriority(listings);
    expect(sorted.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties on price by earliest listing time", () => {
    const listings = [
      { id: "late", sellerId: "s1", priceGBP: 50, listedAt: new Date("2026-08-18") },
      { id: "early", sellerId: "s2", priceGBP: 50, listedAt: new Date("2026-08-16") },
    ];
    const sorted = sortByPriceTimePriority(listings);
    expect(sorted[0].id).toBe("early");
  });
});

describe("rankWantOffers (Section 11.10 — reverse auction)", () => {
  it("excludes offers above the buyer's max price", () => {
    const offers = [
      { id: "1", sellerId: "a", offerPriceGBP: 190, offeredAt: new Date("2026-08-18") },
      { id: "2", sellerId: "b", offerPriceGBP: 171, offeredAt: new Date("2026-08-18") },
    ];
    const ranked = rankWantOffers(offers, 185);
    expect(ranked.map((o) => o.id)).toEqual(["2"]);
  });

  it("ranks the lowest genuine offer first", () => {
    const offers = [
      { id: "high", sellerId: "a", offerPriceGBP: 178, offeredAt: new Date("2026-08-18T10:00:00Z") },
      { id: "low", sellerId: "b", offerPriceGBP: 171, offeredAt: new Date("2026-08-18T11:00:00Z") },
    ];
    const ranked = rankWantOffers(offers, 185);
    expect(ranked[0].id).toBe("low");
  });
});
