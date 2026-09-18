/**
 * Constants pulled directly from the Flipsta business-model document
 * (planning/exchange-concept-explainer.md). Each export is annotated with
 * the section it implements so the code and the business doc never drift
 * apart silently.
 */

export type SubscriptionTier = "free" | "standard" | "pro" | "elite";

export type UrgencyTier = "hot" | "standard" | "stable";

/**
 * Section 11.1 — Dynamic Action Clock ("Deal Heat").
 * "hot" is fixed at a flat 30 minutes per Steven's spec ("if a low price to
 * win then run for 30 minutes") — these are the flame-icon, cheap/urgent
 * deals on the live feed.
 *
 * TEMPORARY — 25 Aug 2026, Steven, while testing: "have the auctions run
 * for 720 mins. just whlst testing cant have them dissapearing off the
 * dashboard." All three tiers set to a flat 720 minutes (12h) so
 * opportunities stay visible long enough to interact with while iterating
 * on everything else. This is explicitly NOT the real spec above — revert
 * to the 30/45/60-minute values (still intact in the comments/history)
 * before real launch, once testing no longer needs the extra time.
 */
export const ACTION_CLOCK_SECONDS: Record<UrgencyTier, { min: number; max: number }> = {
  hot: { min: 720 * 60, max: 720 * 60 },
  standard: { min: 720 * 60, max: 720 * 60 },
  stable: { min: 720 * 60, max: 720 * 60 },
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

/**
 * AI-sourced shop items + crowd fulfillment (26 Aug 2026). Steven: "when the
 * bot... finds an item that has a good margin on it but rejects it as
 * cannot find proof of selling then i want it to... post the item on our
 * shop." These candidates have a genuine retailer discount but no
 * independent resale evidence to back a reseller opportunity, so instead of
 * a bidder buying the right to resell, Flipsta lists and sells the item
 * itself — priced off the retailer's own RRP — and pays a Pro/Elite member
 * to go buy and ship it once it sells. See packages/shared/src/shopPricing.ts.
 */
export const SHOP_ITEM_PAYMENT_PROCESSING_RATE = 0.029; // card processing cut taken off our_price
export const SHOP_ITEM_ESTIMATED_SHIPPING_GBP = 4.99; // typical UK parcel — reimbursed to the fulfiller alongside source cost
// 26 Aug 2026, Steven, after seeing a real £32 pair of shoes only earn a
// flat £8 reward: "Also a reward set at percentages. The more expensive
// the item the better the reward as the reseller is locking up more
// capital." A fulfiller fronts the full source price out of their own
// pocket until they're reimbursed, so the reward now scales with what
// they're actually floating — SHOP_ITEM_FULFILLMENT_REWARD_MIN_GBP keeps a
// cheap item's reward from rounding down to something not worth bothering
// with.
export const SHOP_ITEM_FULFILLMENT_REWARD_PCT = 0.08; // % of the fulfiller's reimbursement (their locked-up capital)
export const SHOP_ITEM_FULFILLMENT_REWARD_MIN_GBP = 5;
export const SHOP_ITEM_PLATFORM_MARGIN_GBP = 5; // what Flipsta keeps once reimbursement + reward + fees are covered
// 26 Aug 2026, Steven: "if there is more than one item available to buy
// the items should not remove themselves from the store." Each unit of
// stock a discovery candidate reports becomes its OWN shop_items row (see
// discoverOpportunities.ts) so selling one unit only removes that one row
// — the product itself stays listed on /shop as long as a sibling row is
// still available (grouped for display in api/shop-items/route.ts). This
// caps how many duplicate rows one candidate can flood the table with if
// the AI reports an implausibly large stock count.
export const SHOP_ITEM_MAX_UNITS_LISTED = 10;
export const SHOP_ITEM_MIN_DISCOUNT_VS_RRP_PCT = 0.08; // must land at least 8% below RRP or there's no real deal to offer
// 26 Aug 2026, Steven, on the break-even price shopPricing.ts computes:
// "thats rck bottom so if someone makes an offer we cannot go lower. maybe
// add 10% on for wiggle room." The break-even amount (covers fulfiller
// reimbursement + reward + margin + payment fees, and NOTHING else) is now
// the true Make-an-Offer floor — it never moves. The Buy Now price shown to
// customers is that floor plus this markup, so there's room to negotiate
// down from the listed price without ever actually selling below cost.
export const SHOP_ITEM_OFFER_WIGGLE_ROOM_PCT = 0.1;
// Fairness (Steven: "make sure this is fair so one person isnt bashing all
// the orders as they come in. maybe put a time delay or limit or something"):
export const SHOP_ITEM_FULFILLMENT_CLAIM_WINDOW_HOURS = 48; // a claimed job with no shipment past this auto-releases
export const SHOP_ITEM_MAX_CONCURRENT_CLAIMS_PER_USER = 2; // cap on jobs one person can hold claimed at once

// 26 Aug 2026, Steven: "we need a referral program" — confirmed via a
// clarifying question: wallet credit for both the referrer and the new
// signup, paid immediately on signup. The actual crediting happens in SQL
// (see migration 0016_referral_program.sql's handle_new_user trigger,
// which hardcodes the same £5.00) — this export exists purely so the
// /referrals page can display the real number instead of a copy that could
// silently drift from what actually gets paid. If this number ever
// changes, update BOTH this constant and the trigger's `reward_gbp`.
export const REFERRAL_REWARD_GBP = 5;

// 27 Aug 2026, Steven: "go away and look at proven selling techniques...
// what makes it almost addictive to keep coming back" — researched (see
// claude/deployment-checklist.md's #-5 section) and scoped via
// AskUserQuestion. Loyalty credit is the "investment" stage of the Hook
// Model: a real % of every real purchase comes back as spendable wallet
// credit, reusing the SAME wallet_transactions ledger referral credit and
// seller payouts already use (migration 0021 just adds a new `kind` value)
// rather than a separate points system — Steven's confirmed answer. Unlike
// REFERRAL_REWARD_GBP, this rate is only ever read in application code
// (apps/web/lib/loyalty.ts) at the moment of award, never hardcoded into a
// SQL trigger, so there's nothing else to keep in sync if it changes.
export const LOYALTY_EARN_RATE_PCT = 1;

// Real, not invented — see the CMA/ICO dark-patterns research in the same
// section. Every shop_items row is one physical unit, so "N left" is always
// a true count straight from the database. Only worth showing once stock is
// actually getting low; above this it'd just be noise on every card.
export const SHOP_LOW_STOCK_THRESHOLD_UNITS = 3;

// 27 Aug 2026, Steven: "i would like to be able to offer my resellers the
// oppotunity to do live selling via my site. a bit like QVC... i think
// whatnot does this already." Researched Whatnot/eBay Live/TikTok Shop
// Live/Amazon Live/QVC (27 Aug 2026, see claude/deployment-checklist.md) —
// every one of them runs each item as a short, fast-turnover clock (QVC's
// own on-air segments are typically a few minutes; Whatnot's live auctions
// commonly run 30-90 seconds per item) to keep momentum and viewer
// attention up, rather than one long auction per item. 2 minutes is a
// reasonable first-pass middle ground for Flipsta's own items (higher
// average value than Whatnot's typical low-cost collectibles, so a little
// longer than Whatnot's fastest cadence) — easy to tune later from this one
// constant once Steven has real hosted shows to compare against.
export const LIVE_SHOW_ITEM_AUCTION_SECONDS = 120;

// Section 8.1-style net-ROI floor for the AI's own opportunity discovery —
// 27 Aug 2026, Steven: "When live oppotunities are available i think the
// minimum ROI should be 15% after all costs are taken into consideration."
// Read as a global discovery floor (opportunities.status = 'live' is the
// existing generic "available to act on" state used everywhere in this
// codebase, not something scoped to the new live-show feature specifically
// — flagged to Steven as this interpretation, open to correction). Applied
// in apps/worker/src/jobs/discoverOpportunities.ts as a genuine NET
// calculation — marketplace commission and a flat shipping estimate
// subtracted before checking the 15% bar — replacing the previous 20%
// GROSS margin proxy that only informally padded for those same costs.
export const MIN_NET_ROI_PCT = 0.15;
// A flat, conservative per-item shipping estimate for the net-ROI check
// only (courier choice/exact shipping cost isn't known this early in the
// pipeline — before a listing or order exists) — matches the higher of the
// two real courier costs already used at actual checkout (see
// lib/orderCreation.ts: DPD is £4.99, Royal Mail £2.99), so the floor
// errs conservative rather than overstating margin.
export const NET_ROI_SHIPPING_ESTIMATE_GBP = 4.99;

/**
 * 18 Sept 2026, Steven: "get the flippy coins shop all working." Real
 * money changes hands here, so the bundle→price mapping has to live
 * server-side and be looked up by id — never trust a price the client
 * sends. These numbers are exactly what /coins already displayed as
 * "coming soon" pricing (16 Sept) — this just makes them real.
 *
 * planning/coin-economy-proposal.md still has several open decisions this
 * does NOT implement: per-tier discounted pricing (the "Subscriber
 * Prices" panel on /coins stays informational only), the monthly
 * subscription coin allowance, spending coins to unlock an opportunity,
 * the free trial / daily login bonus, and the Flippy mascot's random
 * reward. This is scoped to exactly what was asked: buy Flippy Coins,
 * hold a balance, see it in the header.
 */
export type CoinBundleId = "single" | "starter" | "growth" | "arbitrage" | "empire";

export const COIN_BUNDLES: Record<CoinBundleId, { name: string; coins: number; priceGBP: number }> = {
  single: { name: "Single Flippy Coin", coins: 1, priceGBP: 1.0 },
  starter: { name: "Starter Bundle", coins: 10, priceGBP: 9.5 },
  growth: { name: "Growth Bundle", coins: 25, priceGBP: 21.25 },
  arbitrage: { name: "Arbitrage Bundle", coins: 75, priceGBP: 56.25 },
  empire: { name: "Empire Bundle", coins: 150, priceGBP: 90.0 },
};

export function isValidCoinBundle(id: string): id is CoinBundleId {
  return id in COIN_BUNDLES;
}

/**
 * 18 Sept 2026, Steven: "need to add a merch tab on the main landing page
 * with tshirts, caps and other items that people can buy." Real money
 * here too, so — same reasoning as COIN_BUNDLES above — the item→price
 * mapping lives server-side and is looked up by id, never trusted from
 * the client.
 *
 * 18 Sept 2026, Steven, same day: sent through real product photography
 * for five items (mug, tote bag, black hoodie, black cap, white t-shirt)
 * — see apps/web/public/merch/*.jpg. This replaces the emoji-icon
 * placeholders from earlier the same day; the previous "tshirt-black" and
 * "cap-gold" entries are dropped since there's no photo for a black
 * t-shirt or a gold cap (the real cap photographed is black with gold
 * trim) — add them back with their own `imageUrl` if Steven wants them
 * sold too. PRICES ARE STILL PLACEHOLDER — no real pricing came with the
 * photos, so these are carried over unchanged from the emoji-only
 * catalogue and are still Steven's to set.
 */
export type MerchCategory = "apparel" | "headwear" | "other";
export type MerchItemId = "tshirt-white" | "hoodie-black" | "cap-black" | "tote-bag" | "mug";

export const MERCH_ITEMS: Record<
  MerchItemId,
  { name: string; category: MerchCategory; priceGBP: number; sizes?: string[]; imageUrl: string }
> = {
  "tshirt-white": { name: "Flipsta T-Shirt — White", category: "apparel", priceGBP: 19.99, sizes: ["S", "M", "L", "XL", "XXL"], imageUrl: "/merch/tshirt-white.jpg" },
  "hoodie-black": { name: "Flipsta Hoodie — Black", category: "apparel", priceGBP: 34.99, sizes: ["S", "M", "L", "XL", "XXL"], imageUrl: "/merch/hoodie-black.jpg" },
  "cap-black": { name: "Flipsta Cap — Black", category: "headwear", priceGBP: 16.99, imageUrl: "/merch/cap-black.jpg" },
  "tote-bag": { name: "Flipsta Tote Bag", category: "other", priceGBP: 9.99, imageUrl: "/merch/tote-bag.jpg" },
  mug: { name: "Flipsta Mug", category: "other", priceGBP: 11.99, imageUrl: "/merch/mug.jpg" },
};

export function isValidMerchItem(id: string): id is MerchItemId {
  return id in MERCH_ITEMS;
}

/** Flat, single placeholder UK shipping rate — also Steven's to adjust. */
export const MERCH_SHIPPING_GBP = 3.99;

/**
 * 18 Sept 2026, Steven: "add ali express products and add them into our
 * shop with a 25% markup and when someone orders it then a dropship order
 * is created." Unlike merch, these products aren't a fixed in-code
 * catalogue — they're rows in dropship_products (migration 0033), added
 * one at a time by staff from the admin panel (see
 * api/admin/dropship-products/route.ts) since AliExpress's own APIs need
 * their own developer-portal approval (same external gate as eBay/Etsy)
 * and, per DSers' own docs, can never fully automate the AliExpress
 * checkout step anyway. This constant is just the markup formula shared
 * between the admin "add product" form (suggesting a price) and anywhere
 * else that needs to recompute it.
 */
export const DROPSHIP_MARKUP_MULTIPLIER = 1.25;

/** source price -> suggested sale price, rounded to the nearest penny. Staff can still hand-override the result — see dropship_products.our_price_gbp. */
export function computeDropshipPriceGBP(sourcePriceGBP: number): number {
  return Math.round(sourcePriceGBP * DROPSHIP_MARKUP_MULTIPLIER * 100) / 100;
}

/**
 * Flat placeholder — most AliExpress listings already bake shipping into
 * their price, so this starts at £0 rather than merch's £3.99. Steven's to
 * adjust if a particular product needs it.
 */
export const DROPSHIP_SHIPPING_GBP = 0;
