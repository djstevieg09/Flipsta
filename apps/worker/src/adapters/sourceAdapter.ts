/**
 * Section 2 step 1 (Discovery) — a pluggable interface so real sources
 * (Keepa, retailer affiliate feeds, eBay's API) can be swapped in later
 * without touching the discovery job itself. See keepaAdapter.ts for the
 * stub to fill in once an API key is available (INFRASTRUCTURE_TODO.md).
 */
export interface CandidateDeal {
  categorySlug: string;
  /** The specific product's real name, e.g. "Eaglemoss Star Trek Klingon
   * Bird-of-Prey Die-Cast Model" — becomes the listing title once someone
   * wins it (see discoverOpportunities.ts / apps/web/app/sell/new). */
  productName: string;
  /** A real product image URL if one was found, else null — never a
   * placeholder or invented URL. */
  imageUrl: string | null;
  sourceTier: string;
  sourceRetailer: string;
  sourceUrl: string;
  sourcePriceGBP: number;
  estimatedResalePriceGBP: number;
  estimatedStockUnits: number;
  perCustomerCap: number | null;
  priceVolatility: number; // 0-1
  /** The seasonal_events.name this product matches, if the adapter was
   * given seasonal guidance and the product fits one — else null. See
   * DiscoveryContext.seasonalGuidance below and migration 0019. */
  seasonalEventName: string | null;
}

/**
 * 26 Aug 2026, Steven: "We are missing a big trick here. When the bot does a
 * search and finds an item that has a good margin on it but rejects it as
 * cannot find proof of selling then i want it to capture all of the info
 * including photos and then post the item on our shop." A ShopCandidate is
 * that second, lower-bar outcome of the same search: a genuine retailer
 * discount was found, but nothing independent backs a resale estimate, so
 * it can't become a reseller CandidateDeal — instead it's priced off the
 * retailer's own RRP (see packages/shared/src/shopPricing.ts) and listed
 * directly on Flipsta's own /shop, fulfilled by a Pro/Elite member. See
 * migration 0013 for the shop_items table this becomes.
 */
export interface ShopCandidate {
  categorySlug: string;
  /** The specific product's real name — same bar as CandidateDeal.productName. */
  productName: string;
  /** A short customer-facing description. Null if nothing usable was found
   * on the source page — the API/UI falls back to a generic line rather
   * than inventing detail. */
  description: string | null;
  /** A real product image URL if one was found, else null — never invented. */
  imageUrl: string | null;
  sourceRetailer: string;
  sourceUrl: string;
  sourcePriceGBP: number;
  /** The retailer's own listed RRP — the only price anchor available here,
   * since there's no independent resale evidence for this candidate. */
  rrpGBP: number;
  estimatedStockUnits: number;
  /** Same as CandidateDeal.seasonalEventName above. */
  seasonalEventName: string | null;
  /** 26 Aug 2026, Steven, after the AI added shoes to the shop with no size
   * shown: "it needs to read the sizes available on the sites and add
   * those to the listing." Real sizes read off the source page (shoe UK
   * sizes, clothing sizes, etc.) — empty array if the product genuinely
   * has no size variants (electronics, homeware) or the page didn't show
   * any, never invented. discoverOpportunities.ts spreads these across the
   * individual shop_items rows this candidate becomes (see migration 0018's
   * shop_items.size column) so each unit's size is filterable via
   * lib/sizeFilter.ts. Deals/CandidateDeal doesn't get this field — there's
   * no size column on opportunities to hold it yet; a reseller's own
   * listing size is set by them at /sell/new, same as today. */
  sizes: string[];
}

/**
 * 26 Aug 2026, Steven's "tonight's list": admin-editable steering for what
 * discovery should (and shouldn't) go looking for, plus what it's already
 * found recently. discoverOpportunities.ts builds this once per run (from
 * migration 0019's discovery_focus/seasonal_events tables, plus recent
 * opportunities/shop_items) and hands it to the adapter — an adapter that
 * doesn't use context (mockAdapter) can just ignore the parameter entirely.
 */
export interface DiscoveryContext {
  /** category_slug values an admin has paused — the adapter should skip
   * sources tied to these categories rather than spend budget on them. */
  pausedCategorySlugs: string[];
  /** category_slug -> a short admin free-text note steering that
   * category's search (e.g. "push winter coats, ignore trainers this
   * week"). Only present for categories an admin actually left a note on. */
  focusNotes: Record<string, string>;
  /** Seasonal events currently inside their search window (today between
   * search_starts_on and search_ends_on) — the adapter should actively
   * favour matching products from these categories right now, and tag any
   * match with the event's exact `name` via seasonalEventName above. */
  seasonalGuidance: { name: string; categorySlugs: string[]; searchEndsOn: string }[];
  /** Normalized product names sourced in roughly the last 30 days — the
   * adapter should avoid re-reporting the same or a near-identical product,
   * so the shop doesn't fill up with duplicates (Steven: "is the AI
   * learning what its already found... not search over old ground"). */
  recentProductNames: string[];
  /**
   * 26 Aug 2026, Steven: "leanr over time what sells well and not" — the
   * other half of "the cleverest AI buying bot," alongside the admin-set
   * focusNotes above. Unlike focusNotes (a person's opinion), this is
   * computed automatically from real outcomes: what fraction of a
   * category's recent shop_items actually sold, and what fraction of its
   * recent opportunities were actually won, using the same sell-through-rate
   * framework real retailers use (industry rule of thumb: ~70%+ is strong,
   * under ~35% signals a real problem — researched 26 Aug 2026, see
   * claudeSearchAdapter.ts's SELLING TECHNIQUE NOTES for the sourcing). Only
   * present for a category_slug where there's enough recent history to say
   * anything meaningful (see discoverOpportunities.ts's MIN_SAMPLE_SIZE) —
   * a category with too little data just isn't in this map at all, rather
   * than guessing from a tiny sample.
   */
  categoryPerformance: Record<string, { note: string }>;
}

/** One adapter run's full output — the two different outcomes of the same search. */
export interface DiscoveryBatch {
  deals: CandidateDeal[];
  shopCandidates: ShopCandidate[];
}

export type DiscoveryResult = DiscoveryBatch;

export interface SourceAdapter {
  name: string;
  /**
   * 26 Aug 2026, Steven, filling the dashboard for the first time: "i need
   * it to keep goint to start with until its got 1 oppotunity. then stop
   * once its founfd one and its displayed it on dashboard." "Displayed on
   * the dashboard" means an actual opportunity, past the real margin and
   * AI-confidence checks in discoverOpportunities.ts — not just a
   * candidate the adapter itself thinks looks promising, which is a lower
   * bar. onBatch, when provided, lets the caller (discoverOpportunities.ts)
   * run that real verification on each batch of candidates AS the adapter
   * finds them, and tell the adapter "I've got enough, stop early" (return
   * true) or "keep going" (return false) — so a multi-source adapter like
   * claudeSearchAdapter can stop trying more sources the moment a real
   * opportunity has actually been created, not just reported. Adapters
   * that don't do multi-batch discovery (mockAdapter) can ignore this and
   * just return everything at once — the caller still processes whatever
   * comes back either way.
   *
   * shopCandidates in each batch are NEVER part of the stop-early decision
   * — only deals count toward "found enough opportunities" (Steven's
   * target above is about opportunities specifically). Every genuine shop
   * candidate found gets processed regardless, per Steven: "that way any
   * credit used isnt wasted as a missed oppotunity."
   */
  findCandidates(
    onBatch?: (batch: DiscoveryBatch) => Promise<boolean>,
    context?: DiscoveryContext,
  ): Promise<DiscoveryResult>;
}
