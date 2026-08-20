/**
 * Constants pulled directly from the Flipsta business-model document
 * (planning/exchange-concept-explainer.md). Each export is annotated with
 * the section it implements so the code and the business doc never drift
 * apart silently.
 */

export type SubscriptionTier = "free" | "standard" | "pro" | "elite";

export type UrgencyTier = "hot" | "standard" | "stable";

/** Section 11.1 — Dynamic Action Clock ("Deal Heat") */
export const ACTION_CLOCK_SECONDS: Record<UrgencyTier, { min: number; max: number }> = {
  hot: { min: 20 * 60, max: 30 * 60 },
  standard: { min: 45 * 60, max: 45 * 60 },
  stable: { min: 60 * 60, max: 60 * 60 },
};

/** Section 8.1 — Marketplace Commission */
export const MARKETPLACE_COMMISSION_RATE: Record<SubscriptionTier, number> = {
  free: 1, // not eligible to sell; 100% signals "blocked" to calling code
  standard: 0.12,
  pro: 0.08,
  elite: 0.05,
};

/** Section 11.5 — Trade & Wholesale Seller Channel (no subscription, volume-tiered) */
export const TRADE_SELLER_COMMISSION = {
  belowThresholdGmvGBP: 5000,
  belowThresholdRate: 0.12,
  aboveThresholdRate: 0.08,
};

/** Section 7 — Buyback insurance discount by tier */
export const BUYBACK_TIER_DISCOUNT: Record<SubscriptionTier, number> = {
  free: 0,
  standard: 0,
  pro: 0.25, // midpoint of the documented 20-30% range
  elite: 0.25,
};

/** Section 8.3 — Buyback Guarantee pricing formula constants */
export const BUYBACK_PAYOUT_PCT = 0.7;
export const BUYBACK_TARGET_LOSS_RATIO = 0.6;

/** Section 11.6 — Buyback Anti-Abuse Safeguards */
export const BUYBACK_PROOF_OF_LISTING_DAYS = 14;
export const BUYBACK_FINAL_AT_COST_WINDOW_HOURS = 60; // midpoint of documented 48-72h

/** Section 11.3 — Starting Bid & Instant-Win Pricing */
export const STARTING_BID_PCT_OF_MARGIN = { min: 0.15, max: 0.2 };
export const INSTANT_WIN_PCT_OF_MARGIN = { min: 0.4, max: 0.55 };

/** Section 11.2 — Batch Relisting & Market Depth Risk */
export const BATCH_RELIST_SELLTHROUGH_THRESHOLD = 0.6;

/** Section 8.4 — Risk Management: Concentration Risk & Reserves */
export const CONCENTRATION_CAPS = {
  perUserMonthlyGuaranteedValueGBP: 2000,
  perOpportunityAggregateGuaranteedValueGBP: 10000,
};

/** Section 12.1 — staff roles for the admin dashboard, distinct from subscription tier. */
export type StaffRole = "user" | "support" | "admin";
export const STAFF_ROLE_RANK: Record<StaffRole, number> = { user: 0, support: 1, admin: 2 };

/** Account status an admin can set on a seller (Section 12.1 seller management). */
export type AccountStatus = "active" | "under_review" | "suspended";

/** Section 12.1 — support ticket categories and priority-driven SLA windows. */
export const TICKET_CATEGORIES = [
  "payment_dispute",
  "buyback_claim",
  "item_not_as_described",
  "courier_issue",
  "account",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export type TicketPriority = "low" | "medium" | "high";
export type TicketStatus = "open" | "in_progress" | "waiting_on_user" | "resolved";

/** How long a ticket has before it's considered breaching, by priority. */
export const TICKET_SLA_HOURS: Record<TicketPriority, number> = {
  high: 4,
  medium: 24,
  low: 72,
};

/** Section 12.2 — Supplier & Courier Partner Programme. */
export const PARTNER_TYPES = ["supplier", "courier"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];
export type PartnerStatus = "pending" | "active" | "suspended";

/** Section 12.6 — Seller Tax Reporting & HMRC Digital Platform Reporting.
 * A "reportable seller" under the UK's Reporting Rules for Digital Platforms is,
 * broadly, anyone who is NOT excluded by the de minimis threshold below.
 * These figures are a planning-stage approximation of current HMRC guidance —
 * confirm the exact current thresholds directly (see Section 12.6's sources)
 * before this gates any real reporting decision. */
export const HMRC_DE_MINIMIS = {
  maxSalesCount: 30,
  maxTotalConsiderationGBP: 1700, // approx. the OECD model's €2,000 threshold
};

/** Section 12.4 — Reviews & Seller Ratings. */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
