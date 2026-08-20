import { describe, expect, it } from "vitest";
import { shouldOpenNextBatch } from "./relisting.js";

describe("shouldOpenNextBatch (Section 11.2)", () => {
  it("refuses a new batch when the previous one hasn't sold through", () => {
    const result = shouldOpenNextBatch({
      previousBatchUnits: 5,
      previousBatchSoldOrListedUnits: 1,
      perOpportunityCapReached: false,
    });
    expect(result.open).toBe(false);
  });

  it("opens a new batch once sell-through clears the threshold", () => {
    const result = shouldOpenNextBatch({
      previousBatchUnits: 5,
      previousBatchSoldOrListedUnits: 4,
      perOpportunityCapReached: false,
    });
    expect(result.open).toBe(true);
  });

  it("never opens a new batch once the hard exposure cap is reached, regardless of sell-through", () => {
    const result = shouldOpenNextBatch({
      previousBatchUnits: 5,
      previousBatchSoldOrListedUnits: 5,
      perOpportunityCapReached: true,
    });
    expect(result.open).toBe(false);
  });
});
