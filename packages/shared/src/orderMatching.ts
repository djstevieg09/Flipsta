/**
 * Section 11.4 — Order Matching (Price-Time Priority) and
 * Section 11.10 — Buyer Want Requests (reverse-auction variant).
 */

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  priceGBP: number;
  listedAt: Date;
}

/** Lowest price first; ties broken by whoever listed earliest. */
export function sortByPriceTimePriority<T extends MarketplaceListing>(listings: T[]): T[] {
  return [...listings].sort((a, b) => {
    if (a.priceGBP !== b.priceGBP) return a.priceGBP - b.priceGBP;
    return a.listedAt.getTime() - b.listedAt.getTime();
  });
}

export interface WantOffer {
  id: string;
  sellerId: string;
  offerPriceGBP: number;
  offeredAt: Date;
}

/**
 * A Buyer Want's reverse auction: only offers at or below the buyer's max
 * are valid; the winner is the lowest offer, tie-broken by time — same
 * price-time priority rule as the forward marketplace.
 */
export function rankWantOffers(offers: WantOffer[], maxPriceGBP: number): WantOffer[] {
  return offers
    .filter((o) => o.offerPriceGBP <= maxPriceGBP)
    .sort((a, b) => {
      if (a.offerPriceGBP !== b.offerPriceGBP) return a.offerPriceGBP - b.offerPriceGBP;
      return a.offeredAt.getTime() - b.offeredAt.getTime();
    });
}
