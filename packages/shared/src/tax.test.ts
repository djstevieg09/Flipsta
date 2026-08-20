import { describe, expect, it } from "vitest";
import { isHmrcReportableSeller } from "./tax.js";

describe("isHmrcReportableSeller (Section 12.6)", () => {
  it("excludes a very low-volume seller under both thresholds", () => {
    expect(isHmrcReportableSeller({ salesCount: 5, totalConsiderationGBP: 300 })).toBe(false);
  });

  it("is reportable once sales count crosses the de minimis threshold", () => {
    expect(isHmrcReportableSeller({ salesCount: 31, totalConsiderationGBP: 300 })).toBe(true);
  });

  it("is reportable once total consideration crosses the de minimis threshold, even with few sales", () => {
    expect(isHmrcReportableSeller({ salesCount: 5, totalConsiderationGBP: 1800 })).toBe(true);
  });

  it("is reportable when both thresholds are crossed", () => {
    expect(isHmrcReportableSeller({ salesCount: 120, totalConsiderationGBP: 6500 })).toBe(true);
  });
});
