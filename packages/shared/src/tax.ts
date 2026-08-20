import { HMRC_DE_MINIMIS } from "./constants.js";

/**
 * Section 12.6 — Seller Tax Reporting & HMRC Digital Platform Reporting.
 *
 * A seller is a "reportable seller" (and Flipsta must collect/verify their
 * details and report their income to HMRC annually) unless they fall under
 * the de minimis exclusion — broadly, very low-volume sellers. This is a
 * planning-stage approximation; confirm current thresholds with an
 * accountant before this gates a real reporting decision (see the note in
 * Section 12.6 of the business model document).
 */
export interface SellerActivitySummary {
  salesCount: number;
  totalConsiderationGBP: number;
}

export function isHmrcReportableSeller(activity: SellerActivitySummary): boolean {
  const underSalesCount = activity.salesCount < HMRC_DE_MINIMIS.maxSalesCount;
  const underConsideration = activity.totalConsiderationGBP < HMRC_DE_MINIMIS.maxTotalConsiderationGBP;
  const isDeMinimis = underSalesCount && underConsideration;
  return !isDeMinimis;
}
