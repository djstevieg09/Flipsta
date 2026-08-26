"use client";

import { useEffect, useState } from "react";

type ShopItem = {
  id: string;
  product_name: string;
  image_url: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  categories: { name: string } | null;
};

type Opportunity = {
  id: string;
  urgency_tier: "hot" | "standard" | "stable";
  estimated_resale_price_gbp: number | null;
  expected_margin_gbp: number;
  instant_win_price_gbp: number;
  status: string;
  categories: { name: string } | null;
};

/**
 * 26 Aug 2026, Steven: "We need to setup what the main flipsta page will
 * show when someone goes to the webpage. For consumers... Need a home
 * landing page that shows latest deals the site has to offer." Replaces
 * the old dev-scaffold placeholder ("This is the real, database-backed
 * application...") with a real consumer landing page — pulls straight from
 * the same public, already-redacted endpoints /shop and /opportunities use
 * (no new backend needed), so it always shows what's genuinely live right
 * now rather than curated/static content that could go stale.
 */
export default function HomePage() {
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/shop-items").then((r) => r.json()),
      fetch("/api/opportunities").then((r) => r.json()),
    ]).then(([shop, opp]) => {
      setShopItems((shop.items ?? []).slice(0, 6));
      setOpportunities((opp.opportunities ?? []).filter((o: Opportunity) => o.status === "live").slice(0, 3));
      setLoading(false);
    });
  }, []);

  const urgencyColor: Record<string, string> = { hot: "text-red", standard: "text-brand", stable: "text-brand2" };

  return (
    <div className="space-y-12">
      <section className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-extrabold">Real deals, found by AI, verified by real resale data.</h1>
        <p className="text-textDim max-w-xl mx-auto">
          Flipsta's AI scours retailer clearance pages every day for genuine discounts, checks what they actually
          resell for, and brings you the ones worth buying — some to keep at a real discount, some to flip for a
          profit.
        </p>
        <div className="flex justify-center gap-3">
          <a href="/shop" className="btn btn-primary">Shop today's deals</a>
          <a href="/opportunities" className="btn btn-ghost">See Live Opportunities</a>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Latest shop deals</h2>
          <a href="/shop" className="text-xs font-bold text-brand2 hover:underline">
            See all →
          </a>
        </div>
        {loading && <p className="text-textDim text-sm">Loading…</p>}
        {!loading && shopItems.length === 0 && (
          <p className="text-textDim text-sm">Nothing in the shop right now — check back soon.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {shopItems.map((item) => {
            const discountPct = Math.round(((item.rrp_gbp - item.our_price_gbp) / item.rrp_gbp) * 100);
            return (
              <a key={item.id} href="/shop" className="card space-y-2 hover:border-brand2 transition">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.product_name} className="w-full h-28 object-contain bg-surface2 rounded-lg border border-border" />
                ) : (
                  <div className="w-full h-28 rounded-lg border border-border flex items-center justify-center text-[10px] text-textFaint">
                    No photo
                  </div>
                )}
                <div className="font-bold text-sm line-clamp-1">{item.product_name}</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold">£{item.our_price_gbp.toFixed(2)}</span>
                  <span className="text-xs text-textFaint line-through">£{item.rrp_gbp.toFixed(2)}</span>
                  {discountPct > 0 && <span className="text-xs text-green font-bold">{discountPct}% off</span>}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Live reseller opportunities</h2>
          <a href="/opportunities" className="text-xs font-bold text-brand2 hover:underline">
            See all →
          </a>
        </div>
        {!loading && opportunities.length === 0 && (
          <p className="text-textDim text-sm">Nothing live right now — check back soon.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {opportunities.map((o) => (
            <a key={o.id} href="/opportunities" className="card space-y-1 hover:border-brand2 transition">
              <span className={`text-xs font-bold uppercase ${urgencyColor[o.urgency_tier]}`}>{o.urgency_tier}</span>
              <div className="text-sm text-textDim">{o.categories?.name ?? "Item"}</div>
              <div className="text-xs text-green">Est. profit £{o.expected_margin_gbp.toFixed(2)}</div>
              <div className="text-xs text-textDim">Win from £{o.instant_win_price_gbp.toFixed(2)}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="card text-center space-y-3 py-8">
        <h2 className="font-bold text-lg">New here?</h2>
        <p className="text-textDim text-sm max-w-md mx-auto">
          Sign up free to save items to your Wishlist, set your sizes so we only show you what fits, and unlock
          bidding on reseller opportunities.
        </p>
        <a href="/signup" className="btn btn-primary">Create your account</a>
      </section>
    </div>
  );
}
