import { describe, expect, it } from "vitest";
import { averageRating, isValidRating } from "./reviews.js";

describe("isValidRating (Section 12.4)", () => {
  it("accepts integer ratings 1-5", () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
  });

  it("rejects out-of-range or non-integer ratings", () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(3.5)).toBe(false);
  });
});

describe("averageRating (Section 12.4)", () => {
  it("returns null with no ratings yet", () => {
    expect(averageRating([])).toBeNull();
  });

  it("averages and rounds to one decimal place", () => {
    expect(averageRating([5, 4, 5])).toBe(4.7);
  });
});
