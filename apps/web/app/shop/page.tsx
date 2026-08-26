"use client";

import { useEffect, useState } from "react";

type ShopItem = {
  id: string;
  product_name: string;
  description: string | null;
  image_url: string | null;
  rrp_gbp: number;
  our_price_gbp: number;
  min_offer_accept_gbp: number;
  estimated_stock_units: number;
  categories: { name: string } | null;
};

type Product = {
  id: string;
  title: string;
  condition: string;
  description: string | null;
  image_url: string | null;
  lowestPriceGBP: number | null;
  sellerCount: number;
};

/**
 * 26 Aug 2026, Steven: "the RRP is to be displayed along with our price,
 * description and photos, should have a buy now button and also a make an
 * offer. The website is to work out the offer and after taking into
 * consideration all the fees for buying and shipping etc to auto accept
 * the offer." These come from discoverOpportunities.ts's shop_candidates
 * path — a genuine retailer discount the AI found but couldn't back with
 * independent resale evidence — sold and fulfilled directly by Flipsta
 * (see /api/shop-items, /api/fulfillment) rather than via the bid/auction
 * opportunities flow. Shown above "Sold by other sellers" below, which is
 * the original peer-to-peer pooled catalogue (Section 11.4) — a different,
 * already-working feature, still exactly as it was.
 */
export default function ShopPage() {
  const [flipstaItems, setFlipstaItems] = useState<ShopItem[]>([]);
  const [flipstaLoading, setFlipstaLoading] = useState(true);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [products, setProducts] = useState<Product[]>([]);

  async function loadFlipstaItems() {
    setFlipstaLoading(true);
    const res = await fetch("/api/shop-items");
    const data = await res.json();
    setFlipstaItems(data.items ?? []);
    setFlipstaLoading(false);
  }

  useEffect(() => {
    loadFlipstaItems();
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, []);

  async function buyNow(item: ShopItem) {
    setBusy((b) => ({ ...b, [item.id]: true }));
    const res = await fetch("/api/shop-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, action: "buy" }),
    });
    const data = await res.json();
    setMessages((m) => ({
      ...m,
      [item.id]: res.ok
        ? `Bought for £${Number(data.pricePaidGBP).toFixed(2)} — see it in your Portfolio. Held until delivery is confirmed.`
        : data.error,
    }));
    setBusy((b) => ({ ...b, [item.id]: false }));
    if (res.ok) loadFlipstaItems();
  }

  async function makeOffer(item: ShopItem) {
    const raw = offerDrafts[item.id];
    const offerGBP = Number(raw);
    if (!raw || !(offerGBP > 0)) {
      setMessages((m) => ({ ...m, [item.id]: "Enter a valid offer amount first." }));
      return;
    }
    setBusy((b) => ({ ...b, [item.id]: true }));
    const res = await fetch("/api/shop-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, action: "offer", offerGBP }),
    });
    const data = await res.json();
    setMessages((m) => ({
      ...m,
      [item.id]: res.ok
        ? `Offer of £${offerGBP.toFixed(2)} accepted — see it in your Portfolio. Held until delivery is confirmed.`
        : data.error,
    }));
    setBusy((b) => ({ ...b, [item.id]: false }));
    if (res.ok) loadFlipstaItems();
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Shop</h1>
        <p className="text-textDim text-sm">Buy directly from Flipsta, or from other Flipsta sellers, all in one place.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-lg">Sold by Flipsta</h2>
          <p className="text-textDim text-sm">
            Genuine discounts off RRP. Buy Now or make an offer — either way, payment is held until your order's
            confirmed delivered.
          </p>
        </div>
        {flipstaLoading && <p className="text-textDim text-sm">Loading…</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {flipstaItems.map((item) => {
            const discountPct = Math.round(((item.rrp_gbp - item.our_price_gbp) / item.rrp_gbp) * 100);
            return (
              <div key={item.id} className="card space-y-2">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt={item.product_name}
                    className="w-full h-36 object-cover rounded-lg border border-border"
                  />
                ) : (
                  <div className="w-full h-36 rounded-lg border border-border flex items-center justify-center text-[10px] text-textFaint">
                    No photo
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">{item.product_name}</div>
                  <div className="text-xs text-textDim">{item.categories?.name}</div>
                </div>
                {item.description && <div className="text-xs text-textDim line-clamp-3">{item.description}</div>}

                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-extrabold">£{item.our_price_gbp.toFixed(2)}</span>
                  <span className="text-xs text-textFaint line-through">RRP £{item.rrp_gbp.toFixed(2)}</span>
                  {discountPct > 0 && <span className="text-xs text-green font-bold">{discountPct}% off</span>}
                </div>

                <button
                  onClick={() => buyNow(item)}
                  disabled={busy[item.id]}
                  className="w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#5b7cfa,#22d3ee)" }}
                >
                  Buy Now — £{item.our_price_gbp.toFixed(2)}
                </button>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`Min £${item.min_offer_accept_gbp.toFixed(2)}`}
                    value={offerDrafts[item.id] ?? ""}
                    onChange={(e) => setOfferDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                    className="flex-1 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => makeOffer(item)}
                    disabled={busy[item.id]}
                    className="text-xs font-bold border border-border rounded-lg px-3 py-1.5 hover:border-brand2 disabled:opacity-50"
                  >
                    Make an Offer
                  </button>
                </div>

                {messages[item.id] && <div className="text-xs text-textDim">{messages[item.id]}</div>}
              </div>
            );
          })}
          {!flipstaLoading && flipstaItems.length === 0 && (
            <p className="text-textDim text-sm col-span-full">Nothing sold directly by Flipsta right now — check back soon.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-bold text-lg">Sold by other sellers</h2>
          <p className="text-textDim text-sm">
            Pooled lowest-ask pricing per product, computed from real <code>listings</code> rows via{" "}
            <code>/api/products</code> and <code>/api/listings</code> (Section 11.4 price-time priority).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {products.map((p) => (
            <div key={p.id} className="card space-y-1">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt={p.title} className="w-full h-32 object-cover rounded-lg border border-border mb-1" />
              ) : (
                <div className="w-full h-32 rounded-lg border border-border mb-1 flex items-center justify-center text-[10px] text-textFaint">
                  No photo
                </div>
              )}
              <div className="font-bold text-sm">{p.title}</div>
              <div className="text-xs text-textDim">{p.condition}</div>
              {p.description && <div className="text-xs text-textDim line-clamp-2">{p.description}</div>}
              <div className="text-lg font-extrabold">
                {p.lowestPriceGBP ? `from £${p.lowestPriceGBP.toFixed(2)}` : "No sellers yet"}
              </div>
              <div className="text-xs text-textDim">{p.sellerCount} seller(s)</div>
            </div>
          ))}
          {products.length === 0 && <p className="text-textDim text-sm col-span-full">No peer listings yet.</p>}
        </div>
      </section>
    </div>
  );
}
