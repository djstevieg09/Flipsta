/**
 * Section 7's "multi-platform listing" Pro/Elite entitlement, made real:
 * once a seller has an item to list, they can flip a switch and have it
 * cross-posted out to external marketplaces instead of only Flipsta's own.
 */
export const SALES_CHANNELS = [
  { key: "ebay", name: "eBay" },
  // Depop isn't in the original doc's list — added because the proof-of-concept
  // audience (trainers/streetwear/collectibles, Section 4/6.1) is a strong
  // fit for it, and it now has an official seller API (via a Vendoo/partner
  // integration) rather than none, as originally documented here.
  { key: "depop", name: "Depop" },
  // 26 Aug 2026: reverted back to this original Amazon/Vinted/Facebook
  // Marketplace set to match what's actually deployed on Steven's real
  // site — a since-removed local commit had swapped these three for
  // Etsy/Whatnot/StockX, but that change never made it into the real
  // GitHub repo, and a mismatch here is exactly what broke the
  // `channelOAuth.ts` build (its channel-static map is keyed off this
  // union type, so the two must always match what's really deployed).
  // Amazon needs the seller's own pre-existing Seller Central account and
  // has no single fixed authorize URL to hardcode; Vinted has no public
  // seller API at all; Facebook's Graph API deliberately excludes
  // Marketplace. All three are real named channels sellers will expect,
  // but none is currently self-serve-connectable — see channelOAuth.ts.
  { key: "amazon", name: "Amazon" },
  { key: "vinted", name: "Vinted" },
  { key: "facebook_marketplace", name: "Facebook Marketplace" },
] as const;

export type SalesChannelKey = (typeof SALES_CHANNELS)[number]["key"];

export function isValidSalesChannel(key: string): key is SalesChannelKey {
  return SALES_CHANNELS.some((c) => c.key === key);
}

export interface ChannelPublishResult {
  channel: SalesChannelKey;
  success: boolean;
  externalUrl?: string;
  error?: string;
}

/**
 * Publishes one listing to one external channel. Every one of these
 * platforms (eBay, Depop, Etsy, Whatnot, StockX) requires its own
 * seller/developer API account and OAuth credentials before this can make a
 * real call — see INFRASTRUCTURE_TODO.md's cross-posting entry. Until those
 * exist, this simulates success so the auto-post toggle, the listing submit
 * flow, and the worker's retry sweep are all exercisable end to end. Swap
 * the body of this one function out per channel once real API access
 * exists — every call site already goes through here, so the submit
 * handler and the retry job don't need to change.
 */
export async function publishListingToChannel(
  channel: SalesChannelKey,
  listing: { id: string; title: string; priceGBP: number },
): Promise<ChannelPublishResult> {
  return {
    channel,
    success: true,
    externalUrl: `https://example-${channel.replace(/_/g, "-")}.invalid/listing/${listing.id}`,
  };
}

/**
 * Section 12.1/6.1 — "the AI is automatically filling out the listing".
 * A first pass at pre-filling a marketplace listing from a won opportunity:
 * title from the category/source tier the AI already recorded, and a
 * suggested resale price of cost + the AI's full expected margin (i.e. the
 * "AI's original estimated resale price" Section 11.6 refers to). A seller
 * can still edit both before submitting — this is a starting point, not a
 * forced price.
 */
export interface WonOpportunityForListing {
  categoryName: string;
  sourceTier: string;
  sourcePriceGBP: number;
  expectedMarginGBP: number;
  /** 26 Aug 2026: the AI's specific product name, once discoverOpportunities.ts
   * started capturing it — e.g. "Eaglemoss Star Trek Klingon Bird-of-Prey
   * Die-Cast Model". Optional so opportunities created before that change
   * (which only have category/tier) still get a sensible fallback title. */
  productName?: string | null;
  sourceRetailer?: string | null;
}

export interface SuggestedListing {
  suggestedTitle: string;
  suggestedPriceGBP: number;
  suggestedDescription: string;
}

export function suggestListingFromOpportunity(opp: WonOpportunityForListing): SuggestedListing {
  const title = opp.productName?.trim() ? opp.productName.trim() : `${opp.categoryName} — ${opp.sourceTier}`;
  const retailerNote = opp.sourceRetailer ? ` Originally sourced from ${opp.sourceRetailer}.` : "";
  return {
    suggestedTitle: title,
    suggestedPriceGBP: Math.round((opp.sourcePriceGBP + opp.expectedMarginGBP) * 100) / 100,
    suggestedDescription: `${title} — ${opp.categoryName.toLowerCase()}.${retailerNote} Priced to sell quickly at a fair market rate. Edit this description before publishing.`,
  };
}
