"use client";

import { useEffect, useState, type ReactNode } from "react";
import BecomeResellerBanner from "@/app/components/BecomeResellerBanner";
import PageHero from "@/app/components/PageHero";
import ReviewForm from "@/app/components/ReviewForm";

type WonOpportunity = {
  id: string;
  categories: { name: string } | null;
  source_tier: string;
  status: string;
  source_retailer?: string | null;
  source_url?: string | null;
  source_price_gbp?: number | null;
  product_name?: string | null;
  image_url?: string | null;
  instant_win_price_gbp: number;
  estimated_resale_price_gbp: number | null;
  expected_margin_gbp: number;
  created_at: string;
  alreadyListed?: boolean;
};
type Listing = {
  id: string;
  price_gbp: number;
  sold_at: string | null;
  products: { title: string; condition: string } | null;
  listing_channel_posts: { channel: string; status: string; external_url: string | null }[];
};
type Order = { id: string; price_gbp: number; status: string; created_at: string; listings: { products: { title: string } | null } | null };
type BuybackPolicy = {
  id: string;
  opportunityId: string;
  premiumGBP: number;
  payoutPct: number;
  itemPriceGBP: number | null;
  potentialPayoutGBP: number | null;
  claim: { id: string; status: string; listed_at: string } | null;
};
type ShopPurchase = {
  id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  rrp_gbp: number;
  sold_price_gbp: number | null;
  status: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  categories: { name: string } | null;
};

/**
 * Section 12.1's "self serving" ask, made real: everything a seller needs
 * to see about their own activity — wins, listings (with cross-post
 * status), and orders both bought and sold — without an admin in the loop.
 */
export default function PortfolioPage() {
  const [won, setWon] = useState<WonOpportunity[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [ordersAsBuyer, setOrdersAsBuyer] = useState<Order[]>([]);
  const [ordersAsSeller, setOrdersAsSeller] = useState<Order[]>([]);
  const [shopPurchases, setShopPurchases] = useState<ShopPurchase[]>([]);
  const [signedIn, setSignedIn] = useState(true);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});
  // 26 Aug 2026, Steven: "we need to try and convert customers into
  // resellers" — right after seeing their own purchases is a natural
  // moment to pitch fulfilling other people's orders for a reward.
  const [tier, setTier] = useState<string | null>(null);
  // 27 Aug 2026 — see claude/deployment-checklist.md's #-5 research.
  // Keys are "shop_item:<id>" / "opportunity:<id>" (product_reviews) or
  // plain order id (reviews, the pre-existing seller-rating table).
  const [myProductReviews, setMyProductReviews] = useState<Set<string>>(new Set());
  const [mySellerReviewedOrders, setMySellerReviewedOrders] = useState<Set<string>>(new Set());
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [mySellerRating, setMySellerRating] = useState<{ averageRating: number | null; count: number } | null>(null);
  const [reviewFormOpenFor, setReviewFormOpenFor] = useState<string | null>(null);
  // 27 Aug 2026, Steven: "is buyback insurance setup? need to do this if
  // not." Keyed by opportunity id so each won-opportunity card can show its
  // own protection status without a separate fetch per card.
  const [buybackByOpportunity, setBuybackByOpportunity] = useState<Map<string, BuybackPolicy>>(new Map());
  const [claimFormOpenFor, setClaimFormOpenFor] = useState<string | null>(null);

  function loadBuyback() {
    fetch("/api/buyback")
      .then((r) => r.json())
      .then((d) => {
        const map = new Map<string, BuybackPolicy>();
        for (const p of d.policies ?? []) map.set(p.opportunityId, p);
        setBuybackByOpportunity(map);
      });
  }

  async function fileClaim(policyId: string, listedAt: string, listedAtOrBelowEstimate: boolean, offeredAtCostAfterWindow: boolean) {
    const res = await fetch("/api/buyback/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyId, listedAt, listedAtOrBelowEstimate, offeredAtCostAfterWindow }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Something went wrong.";
    setClaimFormOpenFor(null);
    loadBuyback();
    return null;
  }

  function loadShopPurchases() {
    fetch("/api/shop-items?mine=true")
      .then((r) => r.json())
      .then((d) => setShopPurchases(d.items ?? []));
  }

  useEffect(() => {
    fetch("/api/opportunities?won=true").then(async (r) => {
      if (r.status === 401) {
        setSignedIn(false);
        return;
      }
      const d = await r.json();
      setWon(d.opportunities ?? []);
    });
    fetch("/api/listings?mine=true")
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []));
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d) => {
        setOrdersAsBuyer(d.asBuyer ?? []);
        setOrdersAsSeller(d.asSeller ?? []);
      });
    loadShopPurchases();
    loadBuyback();
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.profile?.subscriptionTier ?? null);
        const userId = d.profile?.id ?? null;
        setMyUserId(userId);
        if (userId) {
          fetch(`/api/reviews?sellerId=${userId}`)
            .then((r) => r.json())
            .then((rd) => setMySellerRating({ averageRating: rd.averageRating ?? null, count: rd.count ?? 0 }));
        }
      });
    fetch("/api/product-reviews?mine=true")
      .then((r) => r.json())
      .then((d) => setMyProductReviews(new Set((d.reviews ?? []).map((r: { source_type: string; source_id: string }) => `${r.source_type}:${r.source_id}`))));
    fetch("/api/reviews?mine=true")
      .then((r) => r.json())
      .then((d) => setMySellerReviewedOrders(new Set((d.reviews ?? []).map((r: { order_id: string }) => r.order_id))));
  }, []);

  async function submitProductReview(sourceType: "shop_item" | "opportunity", sourceId: string, rating: number, body: string) {
    const res = await fetch("/api/product-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType, sourceId, rating, body: body || undefined }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Couldn't submit that review.";
    setMyProductReviews((s) => new Set(s).add(`${sourceType}:${sourceId}`));
    return null;
  }

  async function submitSellerReview(orderId: string, rating: number, body: string) {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, rating, comment: body || undefined }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Couldn't submit that review.";
    setMySellerReviewedOrders((s) => new Set(s).add(orderId));
    return null;
  }

  // 26 Aug 2026, Steven: "number one the money does not get released until
  // the item has been delivered" — this is the buyer action that actually
  // triggers it, both the Stripe capture and the fulfiller's payout (see
  // api/shop-items/[id]/confirm-delivery/route.ts).
  async function confirmDelivery(id: string) {
    setConfirming((c) => ({ ...c, [id]: true }));
    const res = await fetch(`/api/shop-items/${id}/confirm-delivery`, { method: "POST" });
    const data = await res.json();
    setConfirmMessage(res.ok ? "Delivery confirmed — thanks!" : data.error);
    setConfirming((c) => ({ ...c, [id]: false }));
    loadShopPurchases();
  }

  if (!signedIn) {
    return (
      <p className="text-textDim text-sm">
        <a className="underline" href="/login">Sign in</a> to see your portfolio.
      </p>
    );
  }

  // 26 Aug 2026: instant-win now auto-lists on win (see
  // lib/autoListOpportunity.ts), so a "won" status alone no longer means
  // unlisted — check alreadyListed too, or this count and the "list one
  // now" prompt both lie for anything the auto-list flow already handled.
  const unlistedWins = won.filter((o) => o.status === "won" && !o.alreadyListed);

  return (
    <div className="space-y-8">
      <PageHero
        title={
          <>
            Your <span className="text-gold">Portfolio</span>
          </>
        }
        subtitle="Everything you've done on Flipsta — wins, listings with their cross-post status, and orders both bought and sold."
        decorations={[
          { emoji: "📈", className: "-top-4 -left-6", animate: "bob" },
          { emoji: "📊", className: "top-1 -right-7", animate: "sway" },
          { emoji: "💷", className: "-bottom-3 left-1/3 w-11 h-11", boxed: true, animate: "bob", delay: "0.4s" },
        ]}
      />

      {(tier === "free" || tier === "standard") && <BecomeResellerBanner />}

      {/* 26 Aug 2026, Steven: "need them to show in purchases with the
          details of the items" — won opportunities (paid Flipsta to win
          the right to buy from the retailer) and orders bought from other
          Flipsta sellers are two different underlying things, but from a
          buyer's point of view they're both "things I've purchased," so
          this section shows both together instead of splitting a won
          opportunity off into its own separate area above the fold. */}
      <section className="space-y-2">
        <h2 className="font-bold text-lg">My purchases</h2>
        {unlistedWins.length > 0 && (
          <p className="text-xs text-gold">
            {unlistedWins.length} won and not listed yet —{" "}
            <a className="underline" href="/sell/new">quick list them now</a>.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {won.map((o) => (
            <div key={o.id} className="card space-y-1">
              {o.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.image_url}
                  alt={o.product_name ?? o.categories?.name ?? "Item"}
                  className="w-full h-28 object-contain bg-surface2 rounded-lg border border-border mb-1"
                />
              )}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-bold text-sm">{o.product_name ?? o.categories?.name ?? "Item"}</div>
                  <div className="text-xs text-textDim">{o.source_tier}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold">£{o.instant_win_price_gbp.toFixed(2)}</div>
                  <div className="text-[10px] text-textDim capitalize">{o.status}</div>
                </div>
              </div>
              <div className="text-xs text-green">
                Est. profit £{o.expected_margin_gbp.toFixed(2)}
                {typeof o.estimated_resale_price_gbp === "number" && ` · resells ~£${o.estimated_resale_price_gbp.toFixed(2)}`}
              </div>
              {/* Section 5's blind-teaser reveal, made visible: everything below
                  this line is redacted on the public feed and only ever comes
                  back from the API once you've actually won the opportunity. */}
              {o.source_retailer ? (
                <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                  <div className="text-xs font-bold">{o.source_retailer}</div>
                  {typeof o.source_price_gbp === "number" && (
                    <div className="text-xs text-textDim">Buy from retailer for: £{o.source_price_gbp.toFixed(2)}</div>
                  )}
                  {o.source_url && (
                    <a
                      href={o.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline text-brand2 break-all inline-block mt-0.5"
                    >
                      Go to purchase link →
                    </a>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-textDim mt-2 pt-2 border-t border-border">
                  Retailer and purchase link will appear here once this win is confirmed.
                </div>
              )}
              {/* 27 Aug 2026, Steven: "One click platform listing needs
                  overhauling... the details, photos and everything needs
                  to be auto filled in." Deep links straight into the new
                  visual picker on /sell/new with this exact win pre-selected
                  (and, per the auto cross-post default there, ready to
                  quick-list in one more click) instead of making the seller
                  find it again themselves. */}
              {o.status === "won" && !o.alreadyListed && (
                <a
                  href={`/sell/new?opportunityId=${o.id}`}
                  className="block text-center text-xs font-bold text-white rounded-lg py-1.5 mt-1"
                  style={{ background: "linear-gradient(135deg,#f2b545,#ffd77a)" }}
                >
                  ⚡ List this item
                </a>
              )}
              {/* 27 Aug 2026, Steven: "is buyback insurance setup? need to
                  do this if not." Only shows anything for a win that was
                  actually protected at purchase time (see
                  /opportunities' "Add buyback protection" checkbox) —
                  nothing shown, no nag, for one that wasn't. */}
              {buybackByOpportunity.has(o.id) && (
                <BuybackStatus
                  policy={buybackByOpportunity.get(o.id)!}
                  claimFormOpen={claimFormOpenFor === o.id}
                  onOpenClaimForm={() => setClaimFormOpenFor(o.id)}
                  onSubmitClaim={(listedAt, listedAtOrBelowEstimate, offeredAtCostAfterWindow) =>
                    fileClaim(buybackByOpportunity.get(o.id)!.id, listedAt, listedAtOrBelowEstimate, offeredAtCostAfterWindow)
                  }
                />
              )}
              {/* 27 Aug 2026 — real trust-signal research, see
                  claude/deployment-checklist.md's #-5 section. */}
              {myProductReviews.has(`opportunity:${o.id}`) ? (
                <div className="text-[10px] text-green border-t border-border mt-2 pt-2">✓ You reviewed this</div>
              ) : reviewFormOpenFor === `opportunity:${o.id}` ? (
                <ReviewForm onSubmit={(rating, body) => submitProductReview("opportunity", o.id, rating, body)} />
              ) : (
                <button
                  onClick={() => setReviewFormOpenFor(`opportunity:${o.id}`)}
                  className="text-[10px] font-bold border-t border-border mt-2 pt-2 text-brand2 text-left w-full"
                >
                  ★ Leave a review
                </button>
              )}
            </div>
          ))}
        </div>

        {shopPurchases.length > 0 && (
          <div className="pt-2">
            {/* 26 Aug 2026, Steven, on "Sold by Flipsta": "that would assume
                we are taking ownership of the sale. We are just a broker" —
                same reasoning as the /shop page's "AI-Sourced Deals"
                heading; avoid language implying Flipsta itself is the one
                shipping the order. */}
            <h3 className="font-bold text-sm text-textDim mb-1">Flipsta Sourced deals</h3>
            {/* 26 Aug 2026, Steven: "Does not need to say brought and
                shipped. Only needs to say shipped." */}
            <p className="text-[10px] text-textFaint mb-2">
              Shipped by an independent Flipsta reseller. Any issue with an order — raise it via Support,
              not the original retailer.
            </p>
            {confirmMessage && <p className="text-xs text-brand2 mb-2">{confirmMessage}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {shopPurchases.map((p) => (
                <div key={p.id} className="card space-y-1">
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt={p.product_name} className="w-full h-28 object-contain bg-surface2 rounded-lg border border-border mb-1" />
                  )}
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-bold text-sm">{p.product_name}</div>
                    <div className="text-right shrink-0">
                      <div className="font-bold">£{(p.sold_price_gbp ?? 0).toFixed(2)}</div>
                      <div className="text-[10px] text-textDim capitalize">{p.status.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  {p.status === "sold_awaiting_fulfillment" && (
                    <div className="text-[10px] text-textDim">Waiting for a fulfiller to claim and ship this.</div>
                  )}
                  {p.status === "shipped" && (
                    <button
                      onClick={() => confirmDelivery(p.id)}
                      disabled={confirming[p.id]}
                      className="w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50 mt-1"
                      style={{ background: "linear-gradient(135deg,#f2b545,#ffd77a)" }}
                    >
                      Confirm delivery
                    </button>
                  )}
                  {p.status === "delivered" && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-green">Delivered — order complete.</div>
                      {myProductReviews.has(`shop_item:${p.id}`) ? (
                        <div className="text-[10px] text-green">✓ You reviewed this</div>
                      ) : reviewFormOpenFor === `shop_item:${p.id}` ? (
                        <ReviewForm onSubmit={(rating, body) => submitProductReview("shop_item", p.id, rating, body)} />
                      ) : (
                        <button
                          onClick={() => setReviewFormOpenFor(`shop_item:${p.id}`)}
                          className="text-[10px] font-bold text-brand2"
                        >
                          ★ Leave a review
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {ordersAsBuyer.length > 0 && (
          <div className="pt-2">
            <h3 className="font-bold text-sm text-textDim mb-2">Bought from other sellers</h3>
            <OrdersTable
              orders={ordersAsBuyer}
              renderReview={(o) =>
                o.status !== "delivered" ? null : mySellerReviewedOrders.has(o.id) ? (
                  <span className="text-[10px] text-green">✓ Reviewed</span>
                ) : reviewFormOpenFor === `order:${o.id}` ? (
                  <ReviewForm onSubmit={(rating, body) => submitSellerReview(o.id, rating, body)} />
                ) : (
                  <button onClick={() => setReviewFormOpenFor(`order:${o.id}`)} className="text-[10px] font-bold text-brand2">
                    ★ Leave a review
                  </button>
                )
              }
            />
          </div>
        )}

        {won.length === 0 && ordersAsBuyer.length === 0 && shopPurchases.length === 0 && (
          <p className="text-textDim text-sm">No purchases yet — browse Live Opportunities or the Shop.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-lg">My listings</h2>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-textDim text-xs uppercase border-b border-border">
                <th className="p-3">Item</th>
                <th className="p-3">Price</th>
                <th className="p-3">Status</th>
                <th className="p-3">Cross-posted to</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{l.products?.title ?? "—"}</td>
                  <td className="p-3">£{Number(l.price_gbp).toFixed(2)}</td>
                  <td className="p-3">{l.sold_at ? "Sold" : "Live"}</td>
                  <td className="p-3 text-textDim">
                    {l.listing_channel_posts.length === 0
                      ? "—"
                      : l.listing_channel_posts.map((c) => `${c.channel} (${c.status})`).join(", ")}
                  </td>
                </tr>
              ))}
              {listings.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-textDim">
                    No listings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg">My sales</h2>
          {/* 27 Aug 2026 — the seller-rating side of the same trust-signal
              feature: this table/API existed since day one (0002_admin_ops.sql
              / api/reviews) but was never surfaced anywhere until now. */}
          {mySellerRating && mySellerRating.count > 0 && (
            <span className="text-xs text-gold">
              {"★".repeat(Math.round(mySellerRating.averageRating ?? 0))}
              {"☆".repeat(5 - Math.round(mySellerRating.averageRating ?? 0))}
              <span className="text-textDim ml-1">
                {mySellerRating.averageRating} ({mySellerRating.count} review{mySellerRating.count === 1 ? "" : "s"})
              </span>
            </span>
          )}
        </div>
        <OrdersTable orders={ordersAsSeller} />
      </section>
    </div>
  );
}

const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending_window: "Claim on file — not eligible yet",
  eligible: "Claim submitted — awaiting review",
  paid: "Claim paid out",
  rejected: "Claim rejected",
};

/**
 * 27 Aug 2026 — the buyback protection status + claim-filing form for one
 * won opportunity. Section 11.6's real anti-abuse gate: a claim is only
 * payable once genuinely, actively listed at or below the AI's estimate for
 * the proof-of-listing window — isBuybackClaimEligible (shared, tested)
 * decides that server-side, this just collects the two real inputs it
 * needs (when you listed it, and whether it's at or below estimate).
 */
function BuybackStatus({
  policy,
  claimFormOpen,
  onOpenClaimForm,
  onSubmitClaim,
}: {
  policy: BuybackPolicy;
  claimFormOpen: boolean;
  onOpenClaimForm: () => void;
  onSubmitClaim: (listedAt: string, listedAtOrBelowEstimate: boolean, offeredAtCostAfterWindow: boolean) => Promise<string | null>;
}) {
  const [listedAt, setListedAt] = useState("");
  const [belowEstimate, setBelowEstimate] = useState(false);
  const [offeredAtCost, setOfferedAtCost] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!listedAt) {
      setError("Enter when you listed it for resale.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await onSubmitClaim(listedAt, belowEstimate, offeredAtCost);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="mt-2 pt-2 border-t border-border space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold text-brand2">
          🛡 Protected — £{policy.potentialPayoutGBP?.toFixed(2) ?? "—"} back if it doesn't sell
        </span>
        <span className="text-textFaint">£{policy.premiumGBP.toFixed(2)} premium</span>
      </div>
      {policy.claim ? (
        <div className="text-[10px] text-textDim">{CLAIM_STATUS_LABEL[policy.claim.status] ?? policy.claim.status}</div>
      ) : claimFormOpen ? (
        <div className="space-y-1.5 pt-1">
          {error && <p className="text-[10px] text-red">{error}</p>}
          <div>
            <label className="block text-[9px] font-bold text-textDim uppercase tracking-wide mb-0.5">
              Listed it for resale on
            </label>
            <input
              type="date"
              className="w-full bg-surface2 border border-border rounded-lg px-2 py-1 text-xs"
              value={listedAt}
              onChange={(e) => setListedAt(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-1.5 text-[10px]">
            <input type="checkbox" checked={belowEstimate} onChange={(e) => setBelowEstimate(e.target.checked)} />
            Listed at or below our estimated resale price
          </label>
          <label className="flex items-center gap-1.5 text-[10px]">
            <input type="checkbox" checked={offeredAtCost} onChange={(e) => setOfferedAtCost(e.target.checked)} />
            Also offered it at cost since the window closed (if applicable)
          </label>
          <button className="btn btn-primary text-[10px] px-2 py-1 w-full" disabled={submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit claim"}
          </button>
        </div>
      ) : (
        <button onClick={onOpenClaimForm} className="text-[10px] font-bold text-brand2 text-left w-full pt-0.5">
          File a buyback claim
        </button>
      )}
    </div>
  );
}

function OrdersTable({ orders, renderReview }: { orders: Order[]; renderReview?: (order: Order) => ReactNode }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-textDim text-xs uppercase border-b border-border">
            <th className="p-3">Item</th>
            <th className="p-3">Price</th>
            <th className="p-3">Status</th>
            <th className="p-3">Date</th>
            {renderReview && <th className="p-3">Review</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-border last:border-0">
              <td className="p-3 font-bold">{o.listings?.products?.title ?? "—"}</td>
              <td className="p-3">£{Number(o.price_gbp).toFixed(2)}</td>
              <td className="p-3 capitalize">{o.status.replace(/_/g, " ")}</td>
              <td className="p-3 text-textDim">{new Date(o.created_at).toLocaleDateString()}</td>
              {renderReview && <td className="p-3 min-w-[140px]">{renderReview(o)}</td>}
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={renderReview ? 5 : 4} className="p-6 text-center text-textDim">
                None yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
