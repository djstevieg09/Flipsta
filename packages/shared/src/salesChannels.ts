/**
 * Section 7's "multi-platform listing" Pro/Elite entitlement, made real:
 * once a seller has an item to list, they can flip a switch and have it
 * cross-posted out to external marketplaces instead of only Flipsta's own.
 */
export const SALES_CHANNELS = [
  { key: "ebay", name: "eBay" },
  { key: "amazon", name: "Amazon Marketplace" },
  { key: "vinted", name: "Vinted" },
  { key: "facebook_marketplace", name: "Facebook Marketplace" },
  // Depop isn't in the original doc's list — added because the proof-of-concept
  // audience (trainers/streetwear/collectibles, Section 4/6.1) is a strong
  // fit for it. Worth confirming before treating it as a committed channel.
  { key: "depop", name: "Depop" },
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
 * platforms (eBay, Amazon, Vinted, Facebook Marketplace, Depop) requires
 * its own seller/developer API account and OAuth credentials before this
 * can make a real call — see INFRASTRUCTURE_TODO.md's cross-posting entry.
 * Until those exist, this simulates success so the auto-post toggle, the
 * listing submit flow, and the worker's retry sweep are all exercisable
 * end to end. Swap the body of this one function out per channel once real
 * API access exists — every call site already goes through here, so the
 * submit handler and the retry job don't need to change.
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
}

export interface SuggestedListing {
  suggestedTitle: string;
  suggestedPriceGBP: number;
}

export function suggestListingFromOpportunity(opp: WonOpportunityForListing): SuggestedListing {
  return {
    suggestedTitle: `${opp.categoryName} — ${opp.sourceTier}`,
    suggestedPriceGBP: Math.round((opp.sourcePriceGBP + opp.expectedMarginGBP) * 100) / 100,
  };
}
