/**
 * Section 7's "multi-platform listing" Pro/Elite entitlement, made real:
 * once a seller has an item to list, they can flip a switch and have it
 * cross-posted out to external marketplaces instead of only Flipsta's own.
 */
export const SALES_CHANNELS = [
  { key: "ebay", name: "eBay" },
  // 27 Aug 2026 real bug, caught while walking Steven through the Etsy
  // signup he asked for: this list still said Amazon/Vinted/Facebook
  // Marketplace, but INFRASTRUCTURE_TODO.md #9 and render.yaml (both
  // current — CHANNEL_ETSY_CLIENT_ID etc. are already scaffolded there)
  // and this very file's own publishListingToChannel() doc comment below
  // all already described the real intended set as eBay/Etsy/Depop/
  // Whatnot/StockX. A 26 Aug 2026 comment here explained that an earlier
  // attempt at this exact swap got reverted because updating this file
  // alone (without also updating channelOAuth.ts's channel-static map,
  // which is keyed off this union type) broke the build — i.e. the swap
  // was half-done and the revert papered over the compile error instead
  // of finishing it. This redoes it properly, updating both files
  // together — see channelOAuth.ts's matching change.
  //
  // Etsy — a strong fit for the same trainers/streetwear/collectibles
  // audience Depop targets, and Etsy Open API v3 is real, self-serve,
  // PKCE-based (no client secret) — see channelOAuth.ts.
  { key: "etsy", name: "Etsy" },
  // Depop isn't in the original doc's list — added because the proof-of-concept
  // audience (trainers/streetwear/collectibles, Section 4/6.1) is a strong
  // fit for it, and it now has an official seller API (via a Vendoo/partner
  // integration) rather than none, as originally documented here.
  { key: "depop", name: "Depop" },
  // Whatnot and StockX both have real seller APIs, but both are gated
  // (a direct application to their developer/partner teams, not
  // self-serve) — see INFRASTRUCTURE_TODO.md #9 and channelOAuth.ts.
  { key: "whatnot", name: "Whatnot" },
  { key: "stockx", name: "StockX" },
  // Amazon, Vinted, and Facebook Marketplace were all considered and
  // deliberately deprioritised (not removed from the plan, just not built
  // against yet) — see INFRASTRUCTURE_TODO.md #9's "kept in mind for
  // later" note for why each one specifically isn't worth building against
  // right now (Amazon needs a pre-existing Seller Central account and
  // often isn't the cheapest source anyway; Vinted has no public seller
  // API at all; Meta's Graph API deliberately excludes Marketplace).
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
